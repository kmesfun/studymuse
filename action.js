'use strict';

// NOTES

// Should we have cards?
// when can invalid intent happen? what does the throw do?
// if they are in the middle of creating a flash card and they then say open planner... is there a way to prompt them?
// erroring when I try to go back to welcome response...
// for planner... how to initialize table?

var AWS = require("aws-sdk");
AWS.config.update({
    region: "us-east-1"
    // The endpoint is found automatically
});

var dynamoDB = new AWS.DynamoDB();
var docClient = new AWS.DynamoDB.DocumentClient();


// Route the incoming request based on type (LaunchRequest, IntentRequest,
// etc.) The JSON body of the request is provided in the event parameter.
exports.handler = function (event, context) {
    try {
        // if (event.session.application.applicationId !== "amzn1.ask.skill.927ef9d0-0f65-4d48-8c30-653b829b06c6") {
        //    context.fail("Invalid Application ID");
        // }

        if (event.session.new) {
            onSessionStarted({requestId: event.request.requestId}, event.session);
        }

        if (event.request.type === "LaunchRequest") {
            onLaunch(event.request,
                event.session,
                function callback(sessionAttributes, speechletResponse) {
                    context.succeed(buildResponse(sessionAttributes, speechletResponse));
                });
        } else if (event.request.type === "IntentRequest") {
            onIntent(event.request,
                event.session,
                function callback(sessionAttributes, speechletResponse) {
                    context.succeed(buildResponse(sessionAttributes, speechletResponse));
                    //buildResponse(sessionAttributes, speechletResponse);
                });
        } else if (event.request.type === "SessionEndedRequest") {
            onSessionEnded(event.request, event.session);
            context.succeed();
        }
    } catch (e) {
        context.fail("Exception: " + e);
    }
};


/**
 * Called when the session starts.
 */
function onSessionStarted(sessionStartedRequest, session) {
    console.log("onSessionStarted requestId=" + sessionStartedRequest.requestId + 
                 ", sessionId=" + session.sessionId);

    // add any session init logic here
}

/**
 * Called when the user invokes the skill without specifying what they want.
 */
function onLaunch(launchRequest, session, callback) {
    console.log("onLaunch requestId=" + launchRequest.requestId +
                ", sessionId=" + session.sessionId);

    getWelcomeResponse(callback);
}

/**
 * Called when the user specifies an intent for session skill.
 */
function onIntent(intentRequest, session, callback) {
    console.log("onIntent requestId=" + intentRequest.requestId +
                ", sessionId=" + session.sessionId);

    var intent = intentRequest.intent,
        intentName = intentRequest.intent.name;

    if (!("attributes" in session)) {
        session["attributes"] = {};
    }
    
    if (!("state" in session.attributes)) {
        session.attributes = {
            "state" : "welcome"
        };
    }


    if ("FlashCardIntent" === intentName) { // might want to remove
        handleFlashCardIntent(intent, session, callback);
    } else if ("PlannerIntent" === intentName) {
        handlePlannerIntent(intent, session, callback);
    } else if ("LecturesIntent" === intentName) {
        handleLecturesIntent(intent, session, callback);
    } else if ("AMAZON.HelpIntent" === intentName) {
        handleHelpRequest(intent, session, callback);
    } else if ("AMAZON.YesIntent" === intentName) {
        handleYesRequest(intent, session, callback);
    } else if ("AMAZON.NoIntent" === intentName) {
        handleNoRequest(intent, session, callback);
    } else if ("AMAZON.StopIntent" === intentName) { // Quit
        handleStopRequest(intent, session, callback);
    } else {
        //handleInvalidIntent(intent, session, callback);
        console.error("INVALID INTENT");
        getWelcomeResponse(callback);
        //throw "Invalid intent";
    }

}

function onSessionEnded(sessionEndedRequest, session) {
    console.log("onSessionEnded requestId=" + sessionEndedRequest.requestId +
                ", sessionId=" + session.sessionId);

    // Add any cleanup logic here
}

// ------- Skill Functions -------

function getWelcomeResponse(callback) {

    var sessionAttributes,
        speechOutput,
        repromptText,
        speechletResponse,
        shouldEndSession = false;
    
    speechOutput = "Study Muse here. You can say flash cards, planner, or lectures. To exit at any time, please say stop.";

    repromptText = "To create a deck or quiz yourself, say flash cards. " +
                    "To add or modify your to do list, say planner. " +
                    "To listen to your recorded lectures, say lectures.";
    
    sessionAttributes = {
        "state" : "welcome"
    };

    speechletResponse = buildSpeechletResponse(speechOutput, repromptText, shouldEndSession);

    callback(sessionAttributes, speechletResponse);
}

function handleFlashCardIntent(intent, session, callback) {
    
    var sessionAttributes,
        speechOutput,
        repromptText,
        speechletResponse,
        state = "flashcards",
        shouldEndSession = false;

    if (session.attributes.state === "welcome" || session.attributes.state === "planner" || session.attributes.state === "lectures") {
        if ("speechOutput" in session.attributes) {
            speechOutput = session.attributes.speechOutput + "If you would like to create a new deck or go to an existing deck, say the deck is blank";
        } else if ("yes" in session.attributes) {
            speechOutput = "You are now at the beginning. <break time=\"0.6s\"/> If you would like to create a new deck or go to an existing deck, say the deck is blank";
        } else {
            speechOutput = "You are now in flash cards mode. If you would like to create a new deck or go to an existing deck, fill in the blank in the following... the deck is blank";     
        }
        repromptText = "fill in the blank in the following... the deck is blank";
        sessionAttributes = {
            "state": state
        };
        speechletResponse = buildSSMLSpeechletResponse(speechOutput, repromptText, shouldEndSession);
        callback(sessionAttributes, speechletResponse);

    } else  if ("Deck" in intent.slots && "value" in intent.slots.Deck) {
        var deckName = intent.slots.Deck.value.toLowerCase().replace(/\s+/g, '');
        sessionAttributes = {
            "state" : state,
            "segment": "deck",
            "deckName" : deckName
        };
        var params = {
            TableName: deckName,
             KeySchema: [       
                { AttributeName: "term", KeyType: "HASH"},
            ],
            AttributeDefinitions: [       
                { AttributeName: "term", AttributeType: "S" },
            ],
            ProvisionedThroughput: {       
                ReadCapacityUnits: 10, 
                WriteCapacityUnits: 10
            }
                    
        };
        
         dynamoDB.createTable(params, function(err, data) {
            if (err) {
                if (err.code === "ResourceInUseException") {
                    speechOutput =  "You are now at your " + deckName + " deck. Would you like to listen, create new cards, edit, delete existing ones, or quiz yourself?"
                    speechletResponse = buildSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                    callback(sessionAttributes, speechletResponse);
                } else if (err.message === "TableName must be at least 3 characters long and at most 255 characters long") {
                    speechOutput = "The deck name must be more than 3 characters and less than 256 characters. Please give another deck name by saying the deck is blank."
                    speechletResponse = buildSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                    sessionAttributes = {
                        "state" : state,
                    };
                    callback(sessionAttributes, speechletResponse); 
                }
            } else {
                console.log("create table succeeded:", JSON.stringify(data, null, 2));
                speechOutput = "Your " + deckName + " deck has been created. To begin making flash cards, say create."
                speechletResponse = buildSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                callback(sessionAttributes, speechletResponse);  
            } 
        });    
        
    } else if ("FlashCardState" in intent.slots 
        && "value" in intent.slots.FlashCardState) {
        var flashCardState = intent.slots.FlashCardState.value.toLowerCase();
        var segment;
        if ("deckName" in session.attributes) {
            if (flashCardState === "listen" || flashCardState === "hear") {
                segment = "listen";
                var params = {
                    TableName:  session.attributes.deckName,
                    ProjectionExpression: "term, term_definition"
                };

                docClient.scan(params,function(err, data) {
                    if (err) {
                        console.error("Unable to scan. Error JSON:", JSON.stringify(err, null, 2));
                        session.attributes = {
                            "state": "welcome",
                            "speechOutput": "There was an error with listing your flash cards. I will take you back to the beginning, please try again.<break time=\"0.5s\"/>"
                        };
                        handleFlashCardIntent(intent, session, callback);
                    } else {
                        speechOutput = "";
                        if (data.Items.length == 0) {
                            speechOutput += "At this time you do not have any flash cards. If you would like to make flash cards, please say create.<break time=\"0.5s\"/>"
                        } else {
                            data.Items.forEach(function(card) {
                                speechOutput += "the term is " + card.term + " <break time=\"0.6s\"/> the definition is " + card.term_definition + " <break time=\"0.6s\"/> ";
                            });
                            speechOutput += "Would you like to continue in flash cards mode?";
                        }
                        sessionAttributes = {
                            "state": state,
                            "deckName": session.attributes.deckName
                        }
                        speechletResponse = buildSSMLSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                        callback(sessionAttributes, speechletResponse);
                        }
                });
            } else if (flashCardState === "create" || flashCardState === "add") {
                segment = "create";
                sessionAttributes = {
                    "state" : state,
                    "segment" : segment,
                    "deckName": session.attributes.deckName
                };
                speechOutput = "I will begin creating your flash cards now. Please say the term is blank."        
                speechletResponse = buildSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                callback(sessionAttributes, speechletResponse);
            } else if (flashCardState === "modify" || flashCardState === "edit") {
                segment = "edit";
                speechOutput = "I will need the term. Please say it by filling in the blank in the following: the term is blank";

                sessionAttributes = {
                    "state" : state,
                    "segment": segment,
                    "deckName": session.attributes.deckName
                };
                speechletResponse = buildSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                callback(sessionAttributes, speechletResponse);
                
            } else if (flashCardState === "delete" || flashCardState === "remove") {
                segment = "delete";
                speechOutput = "I will need the term. Please say it by filling in the blank in the following: the term is blank";

                sessionAttributes = {
                    "state" : state,
                    "segment": segment,
                    "deckName": session.attributes.deckName
                };
                speechletResponse = buildSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                callback(sessionAttributes, speechletResponse);
            } else if (flashCardState === "quiz" || flashCardState === "test") {
                segment = "quiz";
                var params = {
                    TableName:  session.attributes.deckName,
                    ProjectionExpression: "term, term_definition"
                };

                docClient.scan(params,function(err, data) {
                    if (err) {
                        console.error("Unable to scan. Error JSON:", JSON.stringify(err, null, 2));
                        session.attributes = {
                            "state": "welcome",
                            "speechOutput": "There was an error in quiz mode. I will take you back to the beginning, please try again.<break time=\"0.5s\"/>"
                        };
                        handleFlashCardIntent(intent, session, callback);
                    } else {
                        if (data.Items.length == 0) {
                            speechOutput = "You do not have any flash cards in this deck so you cannot activate quiz mode. Please say create in order to begin making flash cards.<break time=\"0.5s\"/>";
                            sessionAttributes = {
                                "state" : state,
                                "deckName": session.attributes.deckName
                            };
                            speechletResponse = buildSSMLSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                            callback(sessionAttributes, speechletResponse);
                        } else {
                            speechOutput = "You are now in quiz mode. <break time=\"0.4s\"/> I will say the definition and you say the term. Please say it in the form the answer is blank.<break time=\"0.4s\"/>" +
                                            " The first definition is " + data.Items[0].term_definition;
                            sessionAttributes = {
                                "state": state,
                                "segment": segment,
                                "cardsList": data.Items,
                                "index": 0,
                                "numCorrect": 0
                            }
                            speechletResponse = buildSSMLSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                            callback(sessionAttributes, speechletResponse);
                        }
                    }
                });
            }
        } else {
            console.error("deck name not in session attributes");
            session.attributes = {
                "state": "welcome",
                "speechOutput": "You didn't say the deck name. I will take you back to the beginning, please try again.<break time=\"0.5s\"/>"
            };
            handleFlashCardIntent(intent, session, callback);
        }
      
    } else if ("Term" in intent.slots && "value" in intent.slots.Term) {
        var term = intent.slots.Term.value.toLowerCase();
        if ("segment" in session.attributes) {
            if ("term" in session.attributes && session.attributes.segment === "edit") {
                var params = {
                    TableName: session.attributes.deckName,
                    Key: {
                        "term": session.attributes.term
                    }
                };

                var definition;

                docClient.get(params, function(err, data) {
                    if (err) {
                        console.error("Edit-GetItem failed. Error JSON:", JSON.stringify(err, null, 2));
                        speechOutput = "There was an error with editing this flash card. I will take you back to the beginning, please try again. <break time=\"0.4s\"/>"
                        speechletResponse = buildSSMLSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                        session.attributes = {
                            "state": "welcome"
                        };
                        handleFlashCardIntent(intent, session, callback);
                    } else {
                        definition = data.Item.term_definition;
                    }
                });

                docClient.delete(params, function(err, data) {
                    if (err) {
                        console.error("Unable to edit-delete item. Error JSON:", JSON.stringify(err, null, 2));
                        speechOutput = "There was an error with editing this flash card. I will take you back to the beginning, please try again. <break time=\"0.4s\"/>"
                        speechletResponse = buildSSMLSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                        session.attributes = {
                            "state": "welcome"
                        };
                        handleFlashCardIntent(intent, session, callback);
                    } else {
                        var params = {
                            TableName: session.attributes.deckName,
                            Item: {
                                "term": term,
                                "term_definition": definition,
                            }
                        };

                        docClient.put(params, function(err, data) {
                            if (err) {
                                console.error("Unable to edit-create item. Error JSON:", JSON.stringify(err, null, 2));
                                speechOutput = "There was an error with editing this flash card. I will take you back to the beginning, please try again. <break time=\"0.4s\"/>"
                                speechletResponse = buildSSMLSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                                session.attributes = {
                                    "state": "welcome"
                                };
                                handleFlashCardIntent(intent, session, callback);
                            } else {
                                sessionAttributes = {
                                    "state": state
                                }
                                speechOutput = " This flash card's name has been updated to " + term + " <break time=\"0.3s\"/> Would you like to continue?";
                                speechletResponse = buildSSMLSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                                callback(sessionAttributes, speechletResponse);
                            }
                        });
                    }
                });
            } else if (session.attributes.segment === "edit") {
                speechOutput = "Got it. <break time=\"0.4s\"/> If you would like to change the term, please say set term to blank. " +
                                "<break time=\"0.4s\"/> If you would like to change the definition, say set definition to blank. ";
                sessionAttributes = {
                    "state": state,
                    "segment": session.attributes.segment,
                    "deckName": session.attributes.deckName,
                    "term": term
                };
                speechletResponse = buildSSMLSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                callback(sessionAttributes, speechletResponse);
            } else if (session.attributes.segment === "create") {
                sessionAttributes = {
                    "state": state,
                    "segment": session.attributes.segment,
                    "deckName": session.attributes.deckName,
                    "term": term
                };
                speechOutput = "What is the definition of " + term + "? Please say it in the form the definition is blank.";
                speechletResponse = buildSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                callback(sessionAttributes, speechletResponse); 
            } else {
                //delete
                var params = {
                    TableName: session.attributes.deckName,
                    Key: {
                        "term": term
                    }
                };
                docClient.delete(params, function(err, data) {
                    if (err) {
                        console.error("Unable to edit-delete item. Error JSON:", JSON.stringify(err, null, 2));
                        speechOutput = "There was an error with deleting this flash card. I will take you back to the beginning, please try again. <break time=\"0.4s\"/>"
                        speechletResponse = buildSSMLSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                        session.attributes = {
                            "state": "welcome"
                        };
                        handleFlashCardIntent(intent, session, callback);
                    } else {
                        sessionAttributes = {
                            "state": state
                        };
                        speechOutput = "" + term + " has been deleted. Would you like to continue?";
                        speechletResponse = buildSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                        callback(sessionAttributes, speechletResponse); 
                    }
                });
            }
        } else {
            console.error("Segment not in session attributes");
            session.attributes = {
                "state": "welcome",
                "speechOutput": "You didn't specify an action. I will take you back to the beginning, please try again.<break time=\"0.5s\"/>"
            };
            handleFlashCardIntent(intent, session, callback);
        }
        
    } else if ("Definition" in intent.slots && "value" in intent.slots.Definition) {
        var termDefinition = intent.slots.Definition.value.toLowerCase();
        if ("term" in session.attributes && "deckName" in session.attributes && "segment" in session.attributes) {
            if (session.attributes.segment === "create") {
                sessionAttributes = {
                    "state": state,
                    "deckName": session.attributes.deckName
                };
                var params = {
                TableName: session.attributes.deckName,
                Item:{
                    "term": session.attributes.term,
                    "term_definition": termDefinition
                    }
                };
                
                docClient.put(params, function(err, data) {
                    if (err) {
                        console.error("Unable to add item. Error JSON:", JSON.stringify(err, null, 2));
                        session.attributes = {
                            "state": "welcome",
                            "speechOutput": "There was an error with creating this flash card. I will take you back to the beginning, please try again.<break time=\"0.5s\"/>"
                        };
                        handleFlashCardIntent(intent, session, callback);
                    } else {
                        //console.log("GetItem succeeded:", JSON.stringify(data, null, 2));
                        speechOutput = session.attributes.term + " has been saved. What is your next term? You can say done when you want to stop.";
                        speechletResponse = buildSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                        callback(sessionAttributes, speechletResponse);
                    }
                });
            } else {
                // edit
                var params = {
                    TableName: session.attributes.deckName,
                    Key: {
                        "term": session.attributes.term
                    },
                    UpdateExpression: "set term_definition = :term_definition",
                    ExpressionAttributeValues: {
                        ":term_definition": termDefinition
                    }
                };

                docClient.update(params, function(err, data) {
                    if (err) {
                        console.error("Unable to update item. Error JSON:", JSON.stringify(err, null, 2));
                        speechOutput = "There was an error with editing this flash card. I will take you back to the beginning, please try again. <break time=\"0.4s\"/>"
                        speechletResponse = buildSSMLSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                        session.attributes = {
                            "state": "welcome"
                        };
                        handleFlashCardIntent(intent, session, callback);
                    } else {
                        speechOutput = "The definition has been updated to " + termDefinition + " <break time=\"0.4s\"/> Would you like to continue in flash cards mode?";
                        sessionAttributes = {
                            "state": state
                        }
                        speechletResponse = buildSSMLSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                        callback(sessionAttributes, speechletResponse);
                    }
                });

            }
        } else {
            console.error("term or definition not in session attributes");
            session.attributes = {
                "state": "welcome",
                "speechOutput": "I need the term and deck name. I will take you back to the beginning, please try again.<break time=\"0.5s\"/>"
            };
            handleFlashCardIntent(intent, session, callback);
        }
    } else if ("Answer" in intent.slots && "value" in intent.slots.Answer) {
        var answer = intent.slots.Answer.value.toLowerCase();
        if ("index" in session.attributes && "cardsList" in session.attributes && "segment" in session.attributes && "numCorrect" in session.attributes) {
            if (session.attributes.index == (session.attributes.cardsList.length - 1)) {
                if (answer === session.attributes.cardsList[session.attributes.index].term.toLowerCase()) {
                    // user got it right
                    session.attributes = {
                        "state": "welcome",
                        "speechOutput": "That answer is correct! <break time=\"0.5s\"/> You have gone through all the terms. You got " + (session.attributes.numCorrect + 1) + " out of " + session.attributes.cardsList.length + " terms correct. I will take you back to the beginning now.<break time=\"0.5s\"/>"
                    };
                    handleFlashCardIntent(intent, session, callback);
                } else {
                    // user got it wrong
                    session.attributes = {
                        "state": "welcome",
                        "speechOutput": "That answer is incorrect! The correct answer is " + session.attributes.cardsList[session.attributes.index].term.toLowerCase() + ".<break time=\"0.5s\"/> You have gone through all the terms. You got " + session.attributes.numCorrect + " out of " + session.attributes.cardsList.length + " terms correct. I will take you back to the beginning now.<break time=\"0.5s\"/>"
                    };
                    handleFlashCardIntent(intent, session, callback);
                }
            } else {
                if (answer === session.attributes.cardsList[session.attributes.index].term.toLowerCase()) {
                    // user got it right
                    sessionAttributes = {
                        "state": state,
                        "segment": session.attributes.segment,
                        "cardsList": session.attributes.cardsList,
                        "index": session.attributes.index + 1,
                        "numCorrect": session.attributes.numCorrect + 1
                    }
                    speechOutput = "That answer is correct! The next definition is " + session.attributes.cardsList[session.attributes.index + 1].term_definition;
                    speechletResponse = buildSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                    callback(sessionAttributes, speechletResponse);
            } else {
                    // user got it wrong
                    sessionAttributes = {
                        "state": state,
                        "segment": session.attributes.segment,
                        "cardsList": session.attributes.cardsList,
                        "index": session.attributes.index + 1,
                        "numCorrect": session.attributes.numCorrect
                    }
                    speechOutput = "That answer is incorrect! The correct answer is " + session.attributes.cardsList[session.attributes.index].term.toLowerCase() + ". The next definition is " + session.attributes.cardsList[session.attributes.index + 1].term_definition;
                    speechletResponse = buildSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                    callback(sessionAttributes, speechletResponse);
                }
            }
        } else {
            console.error("quiz essentials not in session attributes");
            session.attributes = {
                "state": "welcome",
                "speechOutput": "You must specify quiz mode first. I will take you back to the beginning, please try again.<break time=\"0.5s\"/>"
            };
            handleFlashCardIntent(intent, session, callback);
        }

    } else {
        console.log("user said something else");
        session.attributes = {
            "state": "welcome",
            "speechOutput": "I didn't quite get that. Please follow the instructions, I will take you back to the beginning, please try again.<break time=\"0.5s\"/>"
        };
        handleFlashCardIntent(intent, session, callback);
    }
}

function handlePlannerIntent(intent, session, callback) {

    var sessionAttributes,
        speechOutput,
        repromptText,
        state = "planner",
        speechletResponse,
        shouldEndSession = false;

    if (session.attributes.state === "welcome" || session.attributes.state === "flashcards" || session.attributes.state === "lectures") {

        if ("yes" in session.attributes) {
            speechOutput = "You are now at the beginning. <break time=\"0.5s\"/> Would you like to listen to your pending assignments " +
                        "or would you like to add, modify, or delete an assignment? Say it in the form blank assignment.";
        } else if ("speechOutput" in session.attributes) {
            speechOutput = session.attributes.speechOutput + " Would you like to listen to your assignments " +
                        "or would you like to add, modify, or delete an assignment? Say it in the form blank assignment.";
        } else {
            speechOutput = "You are now in planner mode. Would you like to listen to your pending assignments " +
                        "or would you like to add, modify, or delete an assignment? Please say it by filling in the blank in the following: blank assignment.";
        }
        
        repromptText = "please say listen, add, modify, or delete assignment";
        sessionAttributes = {
            "state" : state,
            "tableCreated": true
        };
        speechletResponse = buildSSMLSpeechletResponse(speechOutput, repromptText, shouldEndSession);

        if (!("tableCreated" in session.attributes)) {
            var params = {
                TableName: "Planner",
                 KeySchema: [       
                    { AttributeName: "assignment_name", KeyType: "HASH"},  //Partition key
                    { AttributeName: "assignment_date", KeyType: "RANGE" }
                ],
                AttributeDefinitions: [       
                    { AttributeName: "assignment_name", AttributeType: "S" },
                    { AttributeName: "assignment_date", AttributeType: "S" }
                ],
                ProvisionedThroughput: {       
                    ReadCapacityUnits: 10, 
                    WriteCapacityUnits: 10
                }      
            };

            dynamoDB.createTable(params, function(err, data) {
                if (err) {
                    if (err.code === "ResourceInUseException") {
                        console.log("Planner already exists");
                        callback(sessionAttributes, speechletResponse);
                    } else {
                        console.log("error with creating planner table");
                        session.attributes = {
                            "state": "welcome",
                            "speechOutput": "There was an error with creating your Planner. I will take you back to the beginning, please try again.<break time=\"0.5s\"/>"
                        };
                        handlePlannerIntent(intent, session, callback);
                    }
                        
                } else {
                    console.log("createTable succeeded:", JSON.stringify(data, null, 2));
                    callback(sessionAttributes, speechletResponse);
                }
            });
        } else {
            callback(sessionAttributes, speechletResponse);
        }
    } else if ("PlannerState" in intent.slots && "value" in intent.slots.PlannerState) {

        var plannerState = intent.slots.PlannerState.value.toLowerCase();
        var segment;
        if (plannerState === "listen" || plannerState === "hear") {
            segment = "listen";
            var params = {
                    TableName:  "Planner",
                    ProjectionExpression: "assignment_name, assignment_date, details, subject"
                };

            docClient.scan(params,function(err, data) {
                if (err) {
                    console.error("Unable to scan. Error JSON:", JSON.stringify(err, null, 2));
                    session.attributes = {
                        "state": "welcome",
                        "speechOutput": "There was an error with listing your assignments. I will take you back to the beginning, please try again.<break time=\"0.5s\"/>",
                        "tableCreated": true
                    };
                    handlePlannerIntent(intent, session, callback);
                } else {
                    speechOutput = "";
                    if (data.Items.length == 0) {
                        speechOutput += "At this time you do not have any pending assignments<break time=\"0.5s\"/>"
                    } else {
                        data.Items.forEach(function(assignment) {
                        speechOutput += "your " + assignment.subject + " " + assignment.assignment_name + " is due on " +
                                       assignment.assignment_date + "<break time=\"0.5s\"/> The details are: " + assignment.details + " <break time=\"0.5s\"/>";
                        });
                    }
                    speechOutput += " Would you like to continue in planner mode?";
                    sessionAttributes = {
                        "state": state,
                        "tableCreated": true
                    }
                    speechletResponse = buildSSMLSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                    callback(sessionAttributes, speechletResponse);
                    }
            });
        } else if (plannerState === "create" || plannerState === "add") {
            segment = "create";
            speechOutput = "Ok I will need a few things from you. Lets start off by having you say the name of the assignment " +
                            "by filling in the blank in the following: the name is blank";

            sessionAttributes = {
                "state" : state,
                "segment": segment,
                "tableCreated": true
            };
            speechletResponse = buildSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
            callback(sessionAttributes, speechletResponse);
        } else if (plannerState === "modify" || plannerState === "edit") {
            segment = "edit";
            speechOutput = "In order to modify this assignment, I will need its name and date. Please say the name of " +
                            "the assignment now by filling in the blank in the following: the name is blank";

            sessionAttributes = {
                "state" : state,
                "segment": segment,
                "tableCreated": true
            };
            speechletResponse = buildSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
            callback(sessionAttributes, speechletResponse);
        } else if (plannerState === "delete" || plannerState === "remove") {
            segment = "delete";
            speechOutput = "In order to delete an assignment, I will need its name and date. Please say the name of " +
                            "the assignment now by filling in the blank in the following: " +
                            "the name is blank";

            sessionAttributes = {
                "state" : state,
                "segment": segment,
                "tableCreated": true
            };
            speechletResponse = buildSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
            callback(sessionAttributes, speechletResponse);
        }
        
    } else if ("AssignmentName" in intent.slots && "value" in intent.slots.AssignmentName) {
        console.log("NAME");
        var name = intent.slots.AssignmentName.value.toLowerCase();
        if ("segment" in session.attributes) {
            if ("name" in session.attributes && session.attributes.segment === "edit") {
                var params = {
                    TableName: "Planner",
                    Key: {
                        assignment_date: session.attributes.date,
                        assignment_name: session.attributes.name
                    }
                };

                var subject, details;
                console.log("before get");

                docClient.get(params, function(err, data) {
                    if (err) {
                        console.error("Edit-GetItem failed. Error JSON:", JSON.stringify(err, null, 2));
                        speechOutput = "There was an error with editing this assignment. I will take you back to the beginning, please try again. <break time=\"0.4s\"/>"
                        speechletResponse = buildSSMLSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                        session.attributes = {
                            "state": "welcome",
                            "tableCreated": true
                        };
                        handlePlannerIntent(intent, session, callback);
                    } else {
                        console.log(data);
                        subject = data.Item.subject;
                        details = data.Item.details;
                        console.log("inside get before delete");
                        docClient.delete(params, function(err, data) {
                            if (err) {
                                console.error("Unable to edit-delete item. Error JSON:", JSON.stringify(err, null, 2));
                                speechOutput = "There was an error with editing this assignment. I will take you back to the beginning, please try again. <break time=\"0.4s\"/>"
                                speechletResponse = buildSSMLSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                                session.attributes = {
                                    "state": "welcome",
                                    "tableCreated": true
                                };
                                handlePlannerIntent(intent, session, callback);
                            } else {
                                if ("date" in session.attributes) {

                                    var params = {
                                        TableName: "Planner",
                                        Item: {
                                            subject: subject,
                                            assignment_date: session.attributes.date,
                                            assignment_name: name,
                                            details: details
                                        }
                                    };

                                    docClient.put(params, function(err, data) {
                                        if (err) {
                                            console.error("Unable to edit-create item. Error JSON:", JSON.stringify(err, null, 2));
                                            speechOutput = "There was an error with editing this assignment. I will take you back to the beginning, please try again. <break time=\"0.4s\"/>"
                                            speechletResponse = buildSSMLSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                                            session.attributes = {
                                                "state": "welcome",
                                                "tableCreated": true
                                            };
                                            handlePlannerIntent(intent, session, callback);
                                        } else {
                                            sessionAttributes = {
                                                "state": state,
                                                "tableCreated": true
                                            }
                                            speechOutput = " This assignment's name has been updated to " + name + " <break time=\"0.3s\"/> Would you like to continue?";
                                            speechletResponse = buildSSMLSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                                            callback(sessionAttributes, speechletResponse);
                                        }
                                    });
                                } else {
                                    console.error("date not in session attributes");
                                    session.attributes = {
                                        "state": "welcome",
                                        "speechOutput": "You must specify the date. I will take you back to the beginning, please try again.<break time=\"0.5s\"/>"
                                    };
                                    handlePlannerIntent(intent, session, callback);
                                }
                            }
                        });
                    }
                });

                
            } else {
                sessionAttributes = {
                    "state" : state,
                    "segment": session.attributes.segment,
                    "name": name,
                    "tableCreated": true
                };
                speechOutput = "Got it. I will need the date next. Please say the month then day.";
                speechletResponse = buildSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                callback(sessionAttributes, speechletResponse);
            }
        } else {
            console.error("date not in session attributes");
            session.attributes = {
                "state": "welcome",
                "speechOutput": "You must specify an action. I will take you back to the beginning, please try again.<break time=\"0.5s\"/>"
            };
            handlePlannerIntent(intent, session, callback);
        }

    } else if ("Date" in intent.slots && "value" in intent.slots.Date) {

        var date = intent.slots.Date.value.toLowerCase();
        sessionAttributes = {
            "state" : state,
            "segment": session.attributes.segment,
            "name": session.attributes.name,
            "date": date,
            "tableCreated": true
        };

        if ("segment" in session.attributes) {
            if (session.attributes.segment === "create") {
                speechOutput = "Got it. Please state the subject by saying the subject is blank."
                speechletResponse = buildSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                callback(sessionAttributes, speechletResponse);
            } else if ("date" in session.attributes && session.attributes.segment === "edit") {

                if ("name" in session.attributes) {
                    var params = {
                        TableName: "Planner",
                        Key: {
                            assignment_date: session.attributes.date,
                            assignment_name: session.attributes.name
                        }
                    };

                    var subject, details;

                    docClient.get(params, function(err, data) {
                        if (err) {
                            console.error("Unable to read item. Error JSON:", JSON.stringify(err, null, 2));
                        } else {
                            subject = data.Item.subject;
                            details = data.Item.details;
                        }
                    });

                    docClient.delete(params, function(err, data) {
                        if (err) {
                            console.error("Unable to edit-delete item. Error JSON:", JSON.stringify(err, null, 2));
                            speechOutput = "There was an error with editing this assignment. I will take you back to the beginning, please try again. <break time=\"0.4s\"/>"
                            speechletResponse = buildSSMLSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                            session.attributes = {
                                "state": "welcome",
                                "tableCreated": true
                            };
                            handlePlannerIntent(intent, session, callback);
                        } else {
                            var params = {
                                TableName: "Planner",
                                Item: {
                                    subject: subject,
                                    assignment_date: date,
                                    assignment_name: session.attributes.name,
                                    details: details
                                }
                            };

                            docClient.put(params, function(err, data) {
                                if (err) {
                                    console.error("Unable to edit-create item. Error JSON:", JSON.stringify(err, null, 2));
                                    speechOutput = "There was an error with editing this assignment. I will take you back to the beginning, please try again. <break time=\"0.4s\"/>"
                                    speechletResponse = buildSSMLSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                                    session.attributes = {
                                        "state": "welcome",
                                        "tableCreated": true
                                    };
                                    handlePlannerIntent(intent, session, callback);
                                } else {
                                    sessionAttributes = {
                                        "state": state,
                                        "tableCreated": true
                                    }
                                    speechOutput = " This assignment's date has been updated to " + date + " <break time=\"0.3s\"/> Would you like to continue?";
                                    speechletResponse = buildSSMLSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                                    callback(sessionAttributes, speechletResponse);
                                }
                            });
                        }
                    });
                } else {
                    console.error("name not in session attributes");
                    session.attributes = {
                        "state": "welcome",
                        "speechOutput": "You must specify the name. I will take you back to the beginning, please try again.<break time=\"0.5s\"/>"
                    };
                    handlePlannerIntent(intent, session, callback);
                }
            } else if (session.attributes.segment === "edit") {
                speechOutput = "Got it. <break time=\"0.4s\"/> If you would like to change the name, please say set name to blank. " +
                                "<break time=\"0.4s\"/> If you would like to change the date, say set date to blank. " +
                                "<break time=\"0.4s\"/> If you would like to change the subject, say set subject to blank. " +
                                "<break time=\"0.4s\"/> If you would like to change the details, say set details to blank.";
                speechletResponse = buildSSMLSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                callback(sessionAttributes, speechletResponse);
            } else if (session.attributes.segment === "delete") {
                if ("name" in session.attributes) {
                    var params = {
                        TableName: "Planner",
                        Key: {
                            assignment_name: session.attributes.name,
                            assignment_date: date
                        }
                    };

                    docClient.delete(params, function(err, data) {
                        if (err) {
                            console.error("Unable to delete item. Error JSON:", JSON.stringify(err, null, 2));
                            speechOutput = "There was an error with deleting. I will take you back to the beginning, please try again. <break time=\"0.4s\"/>"
                            speechletResponse = buildSSMLSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                            session.attributes = {
                                "state": "welcome",
                                "tableCreated": true
                            };
                            handlePlannerIntent(intent, session, callback);
                        } else {
                            speechOutput = "" + session.attributes.name + " has successfully been deleted. <break time=\"0.4s\"/> Would you like to continue in planner mode?";
                            sessionAttributes = {
                                "state": state,
                                "tableCreated": true
                            }
                            speechletResponse = buildSSMLSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                            callback(sessionAttributes, speechletResponse);
                        }
                    });
                } else {
                    console.error("name not in session attributes");
                    session.attributes = {
                        "state": "welcome",
                        "speechOutput": "You must specify the name. I will take you back to the beginning, please try again.<break time=\"0.5s\"/>"
                    };
                    handlePlannerIntent(intent, session, callback);
                }
            }
        } else {
            console.error("segment not in session attributes");
            session.attributes = {
                "state": "welcome",
                "speechOutput": "You must specify the action. I will take you back to the beginning, please try again.<break time=\"0.5s\"/>"
            };
            handlePlannerIntent(intent, session, callback);
        }

    } else if ("Subject" in intent.slots && "value" in intent.slots.Subject) {

        var subject = intent.slots.Subject.value.toLowerCase();
        if ("segment" in session.attributes && "name" in session.attributes && "date" in session.attributes) {
            if (session.attributes.segment === "edit") {
                var params = {
                    TableName: "Planner",
                    Key: {
                        assignment_date: session.attributes.date,
                        assignment_name: session.attributes.name
                    },
                    UpdateExpression: "set subject = :subject",
                    ExpressionAttributeValues: {
                        ":subject": subject
                    }
                };

                docClient.update(params, function(err, data) {
                    if (err) {
                        console.error("Unable to update item. Error JSON:", JSON.stringify(err, null, 2));
                        speechOutput = "There was an error with deleting. I will take you back to the beginning, please try again. <break time=\"0.4s\"/>"
                        speechletResponse = buildSSMLSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                        session.attributes = {
                            "state": "welcome",
                            "tableCreated": true
                        };
                        handlePlannerIntent(intent, session, callback);
                    } else {
                        speechOutput = "The subject has been updated to " + subject + " <break time=\"0.4s\"/> Would you like to continue in planner mode?";
                        sessionAttributes = {
                            "state": state,
                            "tableCreated": true
                        }
                        speechletResponse = buildSSMLSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                        callback(sessionAttributes, speechletResponse);
                    }
                });

            } else {
                sessionAttributes = {
                    "state" : state,
                    "segment": session.attributes.segment,
                    "name": session.attributes.name,
                    "date": session.attributes.date,
                    "subject": subject,
                    "tableCreated": true
                };

                speechOutput = "Got it. Please state the details by filling in the blank in the following: " +
                                    "the details are blank";

                speechletResponse = buildSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                callback(sessionAttributes, speechletResponse);
            }
        } else {
            console.error("segment not in session attributes");
            session.attributes = {
                "state": "welcome",
                "speechOutput": "You must specify the action. I will take you back to the beginning, please try again.<break time=\"0.5s\"/>"
            };
            handlePlannerIntent(intent, session, callback);
        }
        
    } else if ("Details" in intent.slots && "value" in intent.slots.Details) {
        var details = intent.slots.Details.value.toLowerCase();
        if ("segment" in session.attributes) {
            if (session.attributes.segment === "edit") {
                if ("name" in session.attributes && "date" in session.attributes) {
                    var params = {
                        TableName: "Planner",
                        Key: {
                            assignment_date: session.attributes.date,
                            assignment_name: session.attributes.name
                        },
                        UpdateExpression: "set details = :details",
                        ExpressionAttributeValues: {
                            ":details": details
                        }
                    };

                    docClient.update(params, function(err, data) {
                        if (err) {
                            console.error("Unable to update item. Error JSON:", JSON.stringify(err, null, 2));
                            speechOutput = "There was an error with updaing this assignment. I will take you back to the beginning, please try again. <break time=\"0.4s\"/>"
                            speechletResponse = buildSSMLSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                            session.attributes = {
                                "state": "welcome",
                                "tableCreated": true
                            };
                            handlePlannerIntent(intent, session, callback);
                        } else {
                            speechOutput = "The details have been updated to " + details + " <break time=\"0.4s\"/> Would you like to continue in planner mode?";
                            sessionAttributes = {
                                "state": state,
                                "tableCreated": true
                            }
                            speechletResponse = buildSSMLSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                            callback(sessionAttributes, speechletResponse);
                        }
                    });
                } else {
                    console.error("name or date not in session attributes");
                    session.attributes = {
                        "state": "welcome",
                        "speechOutput": "You must specify the name and date first. I will take you back to the beginning, please try again.<break time=\"0.5s\"/>"
                    };
                    handlePlannerIntent(intent, session, callback);
                }
            } else {
                if ("name" in session.attributes && "date" in session.attributes && "subject" in session.attributes) {
                    var params = {
                        TableName: "Planner",
                        Item: {
                            subject: session.attributes.subject,
                            assignment_date: session.attributes.date,
                            assignment_name: session.attributes.name,
                            details: details
                            }
                    };

                    docClient.put(params, function(err, data) {
                        if (err) {
                            console.error("Unable to create item. Error JSON:", JSON.stringify(err, null, 2));
                            speechOutput = "There was an error with creating this assignment. I will take you back to the beginning, please try again. <break time=\"0.4s\"/>"
                            speechletResponse = buildSSMLSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                            session.attributes = {
                                "state": "welcome",
                                "tableCreated": true
                            };
                            handlePlannerIntent(intent, session, callback);
                        } else {
                            sessionAttributes = {
                                "state": state,
                                "tableCreated": true
                            }
                            speechOutput = session.attributes.name + " has successfully been added. Would you like to continue in planner mode?";
                            speechletResponse = buildSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
                            callback(sessionAttributes, speechletResponse);
                        }
                    });
                } else {
                    console.error("name, date, or subject not in session attributes");
                    session.attributes = {
                        "state": "welcome",
                        "speechOutput": "You must specify the name, date, and subject. I will take you back to the beginning, please try again.<break time=\"0.5s\"/>"
                    };
                    handlePlannerIntent(intent, session, callback);
                }
            }
        } else {
            console.error("segment not in session attributes");
            session.attributes = {
                "state": "welcome",
                "speechOutput": "You must specify the action. I will take you back to the beginning, please try again.<break time=\"0.5s\"/>"
            };
            handlePlannerIntent(intent, session, callback);
        }
    } else {
        console.log("user said something else");
        session.attributes = {
            "state": "welcome",
            "speechOutput": "I didn't quite get that. Please follow the instructions, I will take you back to the beginning, please try again.<break time=\"0.5s\"/>"
        };
        handlePlannerIntent(intent, session, callback);
    }
}

function handleLecturesIntent(intent, session, callback) {
    
    var speechOutput,
        repromptText,
        state = "lectures",
        sessionAttributes,
        speechletResponse,
        shouldEndSession = false;

    if (session.attributes.state === "welcome" || session.attributes.state === "planner" || session.attributes.state === "flashcards") {
        if ("yes" in session.attributes) {
            speechOutput = "You are now at the beginning <break time=\"0.6s\"/> Please say computer science lecture, business lecture, or sociology lecture."
        } else if ("speechOutput" in session.attributes) {
            speechOutput = session.attributes.speechOutput + " Please say computer science lecture, business lecture, or sociology lecture.";
        } else {
            speechOutput = "Please say computer science lecture, business lecture, or sociology lecture.";
        }
        repromptText = "Say computer science lecture, business lecture, or sociology lecture.";
        sessionAttributes = {
            "state" : state
        };
        speechletResponse = buildSSMLSpeechletResponse(speechOutput, repromptText, shouldEndSession);
        callback(sessionAttributes, speechletResponse);

    } else if ("Lecture" in intent.slots && "value" in intent.slots.Lecture) {
        var lecture = intent.slots.Lecture.value;
        if (lecture === "computer science lecture") {
            speechOutput = "The lecture will begin now <break time=\"1s\"/> <audio src=\"https://s3-us-west-1.amazonaws.com/lectures160/computerscience.mp3\"/> <break time=\"1s\"/> You have reached the end of the lecture. Would you like to continue in lecture mode?";
        } else if (lecture === "business lecture") {
            speechOutput = "The lecture will begin now <break time=\"1s\"/> <audio src=\"https://s3-us-west-1.amazonaws.com/lectures160/business.mp3\"/> <break time=\"1s\"/> You have reached the end of the lecture. Would you like to continue in lecture mode?";
        } else {
            speechOutput = "The lecture will begin now <break time=\"1s\"/> <audio src=\"https://s3-us-west-1.amazonaws.com/lectures160/sociology.mp3\"/> <break time=\"1s\"/> You have reached the end of the lecture. Would you like to continue in lecture mode?";
        }
        sessionAttributes = {
            "state" : state
        };
        speechletResponse = buildSSMLSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
        callback(sessionAttributes, speechletResponse);
    } else {
        console.log("user said something else");
        session.attributes = {
            "state": "welcome",
            "speechOutput": "I didn't quite get that. Please follow the instructions, I will take you back to the beginning, please try again.<break time=\"0.5s\"/>"
        };
        handleLecturesIntent(intent, session, callback);
    }
}

function handleHelpRequest(intent, session, callback) {
    // Ensure that session.attributes has been initialized
    var speechOutput,
        speechletResponse,
        shouldEndSession = false;

    if ("attributes" in session && "state" in session.attributes) {
        if (session.attributes.state == 'welcome') {

        speechOutput = "To create a deck, edit, delete, or quiz yourself, say flashcards. " +
                       "To add, modify, delete, or listen to assignments in your to do list, say planner. " +
                       "To listen to your recorded lectures, say lectures.";

        } else if (session.attributes.state == 'flashcards') {

            speechOutput = "To create a deck or go to an existing deck say the deck is blank";
            
        } else if (session.attributes.state == 'planner') {

            speechOutput = "To add a task say create assignment.";
            
        } else if (session.attributes.state == 'lectures') {

            speechOutput = "Say computer science lecture, business lecture, or sociology lecture.";
            
        } 

        speechletResponse = buildSpeechletResponse(speechOutput, speechOutput, shouldEndSession);

        callback(session.attributes, speechletResponse);
    } else {
        speechOutput = "To create a deck, edit, delete, or quiz yourself, say flashcards. " +
                       "To add, modify, delete, or listen to assignments in your to do list, say planner. " +
                       "To listen to your recorded lectures, say lectures.";
        speechletResponse = buildSpeechletResponse(speechOutput, speechOutput, shouldEndSession);
        callback(session.attributes, speechletResponse);
    }

    
    
}

function handleYesRequest(intent, session, callback) {

    if ("state" in session.attributes && session.attributes.state === "planner") {
        session.attributes = {
            "state": "welcome",
            "yes": "yes",
            "tableCreated": true
        };
        handlePlannerIntent(intent, session, callback);
    } else if ("state" in session.attributes && session.attributes.state === "flashcards") {
        session.attributes = {
            "state": "welcome",
            "yes": "yes"
        };
        handleFlashCardIntent(intent, session, callback);
    } else if ("state" in session.attributes && session.attributes.state === "lectures") {
        session.attributes = {
            "state": "welcome",
            "yes": "yes"
        };
        handleLecturesIntent(intent, session, callback);
    }
}


function handleNoRequest(intent, session, callback) {

    if ("state" in session.attributes && (session.attributes.state === "planner" || session.attributes.state === "flashcards" || session.attributes.state === "lectures")) {
        getWelcomeResponse(callback);

    }

}

function handleStopRequest(intent, session, callback) {

    var speechOutput,
        speechletResponse,
        shouldEndSession = true;

    // having it just exit for now

    speechOutput = "Thanks for using Study Muse! Good bye!"
    

    speechletResponse = 
        buildSSMLSpeechletResponse(speechOutput, speechOutput, shouldEndSession);

    callback({}, speechletResponse);

}


// ------- Helper functions to build responses -------

function buildSpeechletResponse(output, repromptText, shouldEndSession) {
    return {
        outputSpeech: {
            type: "PlainText",
            text: output
        },
        reprompt: {
            outputSpeech: {
                type: "PlainText",
                text: repromptText
            }
        },
        card: {
            type: "Simple",
            title: "Study Muse",
            content: output.replace(/<[^>]*>/g,"")
        },
        shouldEndSession: shouldEndSession
    };
}

function buildSSMLSpeechletResponse(output, repromptText, shouldEndSession) {
    return {
        outputSpeech: {
            type: "SSML",
            ssml: "<speak>"+output+"</speak>"
        },
        reprompt: {
            outputSpeech: {
                type: "PlainText",
                text: repromptText
            }
        },
        card: {
            type: "Simple",
            title: "Study Muse",
            content: output.replace(/<[^>]*>/g,"")
        },
        shouldEndSession: shouldEndSession
    };
}


function buildResponse(sessionAttributes, speechletResponse) {
    return {
        version: "1.0",
        sessionAttributes: sessionAttributes,
        response: speechletResponse
    };
}
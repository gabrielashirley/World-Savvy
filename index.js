'use strict';

const Alexa = require('alexa-sdk');
const questions = require('./question');

const ANSWER_COUNT = 4; // The number of possible answers per trivia question.
const GAME_LENGTH = 5;  // The number of questions per trivia game.
const GAME_STATES = {
    TRIVIA: '_TRIVIAMODE', // Asking trivia questions.
    START: '_STARTMODE', // Entry point, start the game.
    HELP: '_HELPMODE', // The user is asking for help.
};
const APP_ID = undefined;

const speechConsCorrect = ["Booya", "Bingo", "Bravo", "All righty", "Hip hip hooray", "Hurray", "Phew", "Righto", "Way to go", "Well done", "Whee", "Woo hoo", "Yay", "Well done"];

const speechConsWrong = ["Aw man", "D'oh", "Oh dear", "Ouch", "Uh oh", "Wah wah"];

function getRandom(min, max)
{
    return Math.floor(Math.random() * (max-min+1)+min);
}

const languageString = {
    'en': {
        'translation': {
            'QUESTIONS': questions['QUESTIONS_EN_US'],
            'GAME_NAME': 'World Savvy',
            'HELP_MESSAGE': 'I will ask you %s multiple choice questions about different countries\' facts. Respond with the number of the answer. ' +
                'Say one, two, three, or four. To start a new game at any time, say, start game. ',
            'REPEAT_QUESTION_MESSAGE': 'To repeat the last question, say, repeat. ',
            'ASK_MESSAGE_START': 'Would you like to start playing?',
            'HELP_REPROMPT': 'Respond with the number of the answer. ',
            'STOP_MESSAGE': 'Would you like to keep playing?',
            'CANCEL_MESSAGE': 'Ok, let\'s play again soon.',
            'NO_MESSAGE': "<say-as interpret-as='interjection'> uh oh </say-as><break strength='strong'/>" + "<say-as interpret-as='interjection'> no way </say-as><break strength='strong'/>" + "<amazon:effect name='whispered'>Don\'t leave me!</amazon:effect><break strength='strong'/>" + "<say-as interpret-as='interjection'> just kidding </say-as><break strength='strong'/>" + 'Thanks for playing with me! Let\'s travel again next time!',
            'TRIVIA_UNHANDLED': 'Try saying a number between 1 and %s',
            'HELP_UNHANDLED': 'Say yes to continue, or no to end the game.',
            'START_UNHANDLED': 'Say start to start a new game.',
            'NEW_GAME_MESSAGE': "<say-as interpret-as='interjection'> whammo </say-as>" + "<say-as interpret-as='interjection'> wahoo </say-as><break strength='strong'/>" + "<say-as interpret-as='interjection'> ahoy </say-as><break strength='strong'/>" + ' travel buddy! Welcome to <prosody pitch="high" volume="loud">%s!</prosody>! ',
            'WELCOME_MESSAGE': 'Let\'s come with me to explore the world together! Try to answer as many questions as you can from %s questions I will give you. Reach the highest traveler level in this game!' +
            ' Just say the number of the answer. Let\'s get started! ' + "<say-as interpret-as='interjection'> good luck </say-as><break strength='x-strong'/>",
            'ANSWER_CORRECT_MESSAGE': 'correct.' + "<say-as interpret-as='interjection'>" + speechConsCorrect[getRandom(0, speechConsCorrect.length-1)] + "! </say-as><break strength='strong'/>",
            'ANSWER_WRONG_MESSAGE': 'wrong.' + "<say-as interpret-as='interjection'>" + speechConsWrong[getRandom(0, speechConsWrong.length-1)] + " </say-as><break strength='strong'/>",
            'CORRECT_ANSWER_MESSAGE': 'The right answer is %s: %s. ',
            'ANSWER_IS_MESSAGE': 'That answer is ',
            'TELL_QUESTION_MESSAGE': 'Question %s. %s ',
            'GAME_OVER_MESSAGE': 'You got %s out of %s questions correct.',
            'SCORE_IS_MESSAGE': 'Your score is %s. ' + "<audio src='https://s3.amazonaws.com/aws-website-resources-1183x/dice-die-roll.mp3'/>",
        },
    },
    'en-US': {
        'translation': {
            'QUESTIONS': questions['QUESTIONS_EN_US'],
            'GAME_NAME': 'World Savvy',
        },
    },
};

const newSessionHandlers = {
    'LaunchRequest': function () {
        this.handler.state = GAME_STATES.START;
        this.emitWithState('StartGame', true);
    },
    'AMAZON.StartOverIntent': function () {
        this.handler.state = GAME_STATES.START;
        this.emitWithState('StartGame', true);
    },
    'AMAZON.HelpIntent': function () {
        this.handler.state = GAME_STATES.HELP;
        this.emitWithState('helpTheUser', true);
    },
    'Unhandled': function () {
        const speechOutput = this.t('START_UNHANDLED');
        this.response.speak(speechOutput).listen(speechOutput);
        this.emit(':responseReady');
    },
};

function populateGameQuestions(translatedQuestions) {
    const gameQuestions = [];
    const indexList = [];
    let index = translatedQuestions.length;

    if (GAME_LENGTH > index) {
        throw new Error('Invalid Game Length.');
    }

    for (let i = 0; i < translatedQuestions.length; i++) {
        indexList.push(i);
    }

    // Pick GAME_LENGTH random questions from the list to ask the user, make sure there are no repeats.
    for (let j = 0; j < GAME_LENGTH; j++) {
        const rand = Math.floor(Math.random() * index);
        index -= 1;

        const temp = indexList[index];
        indexList[index] = indexList[rand];
        indexList[rand] = temp;
        gameQuestions.push(indexList[index]);
    }

    return gameQuestions;
}

function populateRoundAnswers(gameQuestionIndexes, correctAnswerIndex, correctAnswerTargetLocation, translatedQuestions) {
    const answers = [];
    const answersCopy = translatedQuestions[gameQuestionIndexes[correctAnswerIndex]][Object.keys(translatedQuestions[gameQuestionIndexes[correctAnswerIndex]])[0]].slice();
    let index = answersCopy.length;
    if (index < ANSWER_COUNT) {
        throw new Error('Not enough answers for question.');
    }

    // Shuffle the answers, excluding the first element which is the correct answer.
    for (let j = 1; j < answersCopy.length; j++) {
        const rand = Math.floor(Math.random() * (index - 1)) + 1;
        index -= 1;

        const swapTemp1 = answersCopy[index];
        answersCopy[index] = answersCopy[rand];
        answersCopy[rand] = swapTemp1;
    }

    // Swap the correct answer into the target location
    for (let i = 0; i < ANSWER_COUNT; i++) {
        answers[i] = answersCopy[i];
    }
    const swapTemp2 = answers[0];
    answers[0] = answers[correctAnswerTargetLocation];
    answers[correctAnswerTargetLocation] = swapTemp2;
    return answers;
}

function isAnswerSlotValid(intent) {
    const answerSlotFilled = intent && intent.slots && intent.slots.Answer && intent.slots.Answer.value;
    const answerSlotIsInt = answerSlotFilled && !isNaN(parseInt(intent.slots.Answer.value, 10));
    return answerSlotIsInt
        && parseInt(intent.slots.Answer.value, 10) < (ANSWER_COUNT + 1)
        && parseInt(intent.slots.Answer.value, 10) > 0;
}

function handleUserGuess(userGaveUp) {
    const answerSlotValid = isAnswerSlotValid(this.event.request.intent);
    let speechOutput = '';
    let speechOutputAnalysis = '';
    const gameQuestions = this.attributes.questions;
    let correctAnswerIndex = parseInt(this.attributes.correctAnswerIndex, 10);
    let currentScore = parseInt(this.attributes.score, 10);
    let currentQuestionIndex = parseInt(this.attributes.currentQuestionIndex, 10);
    const correctAnswerText = this.attributes.correctAnswerText;
    const translatedQuestions = questions['QUESTIONS_EN_US'];

    if (answerSlotValid && parseInt(this.event.request.intent.slots.Answer.value, 10) === this.attributes['correctAnswerIndex']) {
        currentScore++;
        speechOutputAnalysis = this.t('ANSWER_CORRECT_MESSAGE');
    } else {
        if (!userGaveUp) {
            speechOutputAnalysis = this.t('ANSWER_WRONG_MESSAGE');
        }

        speechOutputAnalysis += this.t('CORRECT_ANSWER_MESSAGE', correctAnswerIndex, correctAnswerText);
    }

    if (this.attributes['currentQuestionIndex'] === GAME_LENGTH - 1) {
        speechOutput = userGaveUp ? '' : this.t('ANSWER_IS_MESSAGE');
        speechOutput += speechOutputAnalysis + this.t('GAME_OVER_MESSAGE', currentScore.toString(), GAME_LENGTH.toString());
        var closing = ' Hope you enjoy playing with <prosody pitch="high" volume="loud">World Savvy!</prosody> Let\'s travel again next time!' + "<say-as interpret-as='interjection'> merci </say-as><break strength='strong'/>" + "<say-as interpret-as='interjection'> woo hoo </say-as>";
        if (currentScore <= 1) {
            speechOutput += ' You achieved baby traveler level!!! It\'s a big world out there, go explore it! You\'ll be surprised at how interesting it is to learn about all the other countries in the world.' + "<say-as interpret-as='interjection'> way to go </say-as><break strength='x-strong'/>" + closing;
        }
        else if (currentScore <= 2) {
            speechOutput += ' You achieved teenage traveler level!!! You may have been around the block of a couple of times, but next time, try paying attention of what\'s around you.' + "<say-as interpret-as='interjection'> cheer up </say-as><break strength='x-strong'/>" + closing;
        }
        else if (currentScore <= 4) {
            speechOutput += ' You achieved adult traveler level!!! Keep it up and you\'ll soon be the most well-traveled and cultured person around!' + "<say-as interpret-as='interjection'> bravo </say-as><break strength='x-strong'/>" + closing;
        }
        else if (currentScore <= 5) {
            speechOutput += ' Congratulations!!! You achieved senior traveler level!!! You love learning about different countries and their cultures, good for you!' + "<say-as interpret-as='interjection'> well done </say-as><break strength='x-strong'/>" + closing;
        }

        this.response.speak(speechOutput);
        this.emit(':responseReady');

    } else {
        currentQuestionIndex += 1;
        correctAnswerIndex = Math.floor(Math.random() * (ANSWER_COUNT));
        const spokenQuestion = Object.keys(translatedQuestions[gameQuestions[currentQuestionIndex]])[0];
        const roundAnswers = populateRoundAnswers.call(this, gameQuestions, currentQuestionIndex, correctAnswerIndex, translatedQuestions);
        const questionIndexForSpeech = currentQuestionIndex + 1;
        let repromptText = this.t('TELL_QUESTION_MESSAGE', questionIndexForSpeech.toString(), spokenQuestion);

        for (let i = 0; i < ANSWER_COUNT; i++) {
            repromptText += `${i + 1}. ${roundAnswers[i]}. `;
        }

        speechOutput += userGaveUp ? '' : this.t('ANSWER_IS_MESSAGE');
        speechOutput += speechOutputAnalysis + this.t('SCORE_IS_MESSAGE', currentScore.toString()) + repromptText;

        Object.assign(this.attributes, {
            'speechOutput': repromptText,
            'repromptText': repromptText,
            'currentQuestionIndex': currentQuestionIndex,
            'correctAnswerIndex': correctAnswerIndex + 1,
            'questions': gameQuestions,
            'score': currentScore,
            'correctAnswerText': translatedQuestions[gameQuestions[currentQuestionIndex]][Object.keys(translatedQuestions[gameQuestions[currentQuestionIndex]])[0]][0],
        });

        this.response.speak(speechOutput).listen(repromptText);
        this.response.cardRenderer(this.t('GAME_NAME', repromptText));
        this.emit(':responseReady');
    }
}

const startStateHandlers = Alexa.CreateStateHandler(GAME_STATES.START, {
    'StartGame': function (newGame) {
        let speechOutput = newGame ? this.t('NEW_GAME_MESSAGE', this.t('GAME_NAME')) + this.t('WELCOME_MESSAGE', GAME_LENGTH.toString()) : '';
        // Select GAME_LENGTH questions for the game
        const translatedQuestions = questions['QUESTIONS_EN_US'];
        const gameQuestions = populateGameQuestions(translatedQuestions);
        // Generate a random index for the correct answer, from 0 to 3
        const correctAnswerIndex = Math.floor(Math.random() * (ANSWER_COUNT));
        // Select and shuffle the answers for each question
        const roundAnswers = populateRoundAnswers(gameQuestions, 0, correctAnswerIndex, translatedQuestions);
        const currentQuestionIndex = 0;
        const spokenQuestion = Object.keys(translatedQuestions[gameQuestions[currentQuestionIndex]])[0];
        let repromptText = this.t('TELL_QUESTION_MESSAGE', '1', spokenQuestion);

        for (let i = 0; i < ANSWER_COUNT; i++) {
            repromptText += `${i + 1}. ${roundAnswers[i]}. `;
        }

        speechOutput += repromptText;

        Object.assign(this.attributes, {
            'speechOutput': repromptText,
            'repromptText': repromptText,
            'currentQuestionIndex': currentQuestionIndex,
            'correctAnswerIndex': correctAnswerIndex + 1,
            'questions': gameQuestions,
            'score': 0,
            'correctAnswerText': translatedQuestions[gameQuestions[currentQuestionIndex]][Object.keys(translatedQuestions[gameQuestions[currentQuestionIndex]])[0]][0],
        });

        // Set the current state to trivia mode. The skill will now use handlers defined in triviaStateHandlers
        this.handler.state = GAME_STATES.TRIVIA;

        this.response.speak(speechOutput).listen(repromptText);
        this.response.cardRenderer(this.t('GAME_NAME'), repromptText);
        this.emit(':responseReady');
    },
});

const triviaStateHandlers = Alexa.CreateStateHandler(GAME_STATES.TRIVIA, {
    'AnswerIntent': function () {
        handleUserGuess.call(this, false);
    },
    'DontKnowIntent': function () {
        handleUserGuess.call(this, true);
    },
    'AMAZON.StartOverIntent': function () {
        this.handler.state = GAME_STATES.START;
        this.emitWithState('StartGame', false);
    },
    'AMAZON.RepeatIntent': function () {
        this.response.speak(this.attributes['speechOutput']).listen(this.attributes['repromptText']);
        this.emit(':responseReady');
    },
    'AMAZON.HelpIntent': function () {
        this.handler.state = GAME_STATES.HELP;
        this.emitWithState('helpTheUser', false);
    },
    'AMAZON.StopIntent': function () {
        this.handler.state = GAME_STATES.HELP;
        const speechOutput = this.t('STOP_MESSAGE');
        this.response.speak(speechOutput).listen(speechOutput);
        this.emit(':responseReady');
    },
    'AMAZON.CancelIntent': function () {
        this.response.speak(this.t('CANCEL_MESSAGE'));
        this.emit(':responseReady');
    },
    'Unhandled': function () {
        const speechOutput = this.t('TRIVIA_UNHANDLED', ANSWER_COUNT.toString());
        this.response.speak(speechOutput).listen(speechOutput);
        this.emit(':responseReady');
    },
    'SessionEndedRequest': function () {
        console.log(`Session ended in trivia state: ${this.event.request.reason}`);
    },
});

const helpStateHandlers = Alexa.CreateStateHandler(GAME_STATES.HELP, {
    'helpTheUser': function (newGame) {
        const askMessage = newGame ? this.t('ASK_MESSAGE_START') : this.t('REPEAT_QUESTION_MESSAGE') + this.t('STOP_MESSAGE');
        const speechOutput = this.t('HELP_MESSAGE', GAME_LENGTH) + askMessage;
        const repromptText = this.t('HELP_REPROMPT') + askMessage;

        this.response.speak(speechOutput).listen(repromptText);
        this.emit(':responseReady');
    },
    'AMAZON.StartOverIntent': function () {
        this.handler.state = GAME_STATES.START;
        this.emitWithState('StartGame', false);
    },
    'AMAZON.RepeatIntent': function () {
        const newGame = !(this.attributes['speechOutput'] && this.attributes['repromptText']);
        this.emitWithState('helpTheUser', newGame);
    },
    'AMAZON.HelpIntent': function () {
        const newGame = !(this.attributes['speechOutput'] && this.attributes['repromptText']);
        this.emitWithState('helpTheUser', newGame);
    },
    'AMAZON.YesIntent': function () {
        if (this.attributes['speechOutput'] && this.attributes['repromptText']) {
            this.handler.state = GAME_STATES.TRIVIA;
            this.emitWithState('AMAZON.RepeatIntent');
        } else {
            this.handler.state = GAME_STATES.START;
            this.emitWithState('StartGame', false);
        }
    },
    'AMAZON.NoIntent': function () {
        const speechOutput = this.t('NO_MESSAGE');
        this.response.speak(speechOutput);
        this.emit(':responseReady');
    },
    'AMAZON.StopIntent': function () {
        const speechOutput = this.t('STOP_MESSAGE');
        this.response.speak(speechOutput).listen(speechOutput);
        this.emit(':responseReady');
    },
    'AMAZON.CancelIntent': function () {
        this.response.speak(this.t('CANCEL_MESSAGE'));
        this.emit(':responseReady');
    },
    'Unhandled': function () {
        const speechOutput = this.t('HELP_UNHANDLED');
        this.response.speak(speechOutput).listen(speechOutput);
        this.emit(':responseReady');
    },
    'SessionEndedRequest': function () {
        console.log(`Session ended in help state: ${this.event.request.reason}`);
    },
});

exports.handler = function (event, context) {
    const alexa = Alexa.handler(event, context);
    alexa.appId = APP_ID;
    // To enable string internationalization (i18n) features, set a resources object.
    alexa.resources = languageString;
    alexa.registerHandlers(newSessionHandlers, startStateHandlers, triviaStateHandlers, helpStateHandlers);
    alexa.execute();
};

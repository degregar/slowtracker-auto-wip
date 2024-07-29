const axios = require('axios');
const OpenAI = require('openai');
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses")
require('dotenv').config();

const sesClient = new SESClient({ region: process.env.SES_REGION });

const getPrompt = (content, tags) => {
    return `
You'll get a success, win or a lesson learned from a user. I need you to summarize it shortly in English (one sentence). Write it from the 1st person perspective. At the end of the summary please add the tags: ${tags.filter(tag => tag !== "wip").join(', ')}.

Provided content:
---
${content}
`
}

const createSendEmailCommand = (toAddress, fromAddress, subject, textBody) => {
    return new SendEmailCommand({
        Destination: {
            ToAddresses: [toAddress],
        },
        Message: {
            Body: {
                Text: {
                    Charset: "UTF-8",
                    Data: textBody,
                },
            },
            Subject: {
                Charset: "UTF-8",
                Data: subject,
            },
        },
        Source: fromAddress,
    });
};


exports.handler = async (event) => {
    try {
        // Step 1: Fetch entries from SlowTracker API
        const response = await axios.get('https://api.slowtracker.com/wins?period=30&tags=wip', {
            headers: { 'Authorization': `Bearer ${process.env.SLOWTRACKER_API_KEY}` }
        });

        const entries = response.data;
        if (entries.length === 0) {
            console.log('No entries found');
            return;
        }

        const entry = entries[entries.length - 1];
        const { uuid, tags, label: content } = entry;

        if (!content) {
            console.error('No content found');
            return;
        }

        console.info(`Processing entry: ${content}`);

        // Step 2: Translate and summarize content using OpenAI API
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        const prompt = getPrompt(content, tags)

        const gptResponse = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
        });

        const translatedContent = gptResponse.choices[0].message.content.trim();

        console.info('Translated and summarized content:', translatedContent)


        // Step 3: Send email using SES
        const fromAddress = process.env.FROM_EMAIL;
        const toAddress = process.env.TO_EMAIL;
        const subject = 'Dodaj do WIP';

        const sendEmailCommand = createSendEmailCommand(toAddress, fromAddress, subject, translatedContent);
        try {
            await sesClient.send(sendEmailCommand);
            console.log('Email sent successfully');
        } catch (error) {
            console.error('Error sending email:', error);
        }

        // Step 4: Update entry with new tags
        const newTags = tags.filter(tag => tag !== 'wip').concat('wip-added');
        await axios.patch(`https://api.slowtracker.com/wins/${uuid}`, {
            tags: newTags
        }, {
            headers: { 'Authorization': `Bearer ${process.env.SLOWTRACKER_API_KEY}` }
        });

        console.log('Process completed successfully');

    } catch (error) {
        console.error('Error:', error);
    }
};

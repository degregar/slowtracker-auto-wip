const axios = require('axios');
const OpenAI = require('openai');
const { SESClient } = require("@aws-sdk/client-ses");
const nodemailer = require("nodemailer");
require('dotenv').config();

const sesClient = new SESClient({ region: process.env.SES_REGION });

const getPrompt = (content, tags) => {
    return `
You'll get a success, win or a lesson learned from a user. I need you to summarize it shortly in English (one sentence). Write it from the 1st person perspective. Replace name of the project with one of the following tags: ${tags.filter(tag => tag !== "wip").join(', ')}.

My projects:
- SpeechZap
- SlowTracker

For example, for the following content:
---
Rozmowa z potencjalnym partnerem biznesowym o aplikacji SpeechZap i wzięciu udziału w programie partnerskim, w którym daję 25% prowizji przez rok od zarejestrowania się nowego klienta.
---

You should write:
---
I had a conversation with a potential business partner about the #speechzap app and offered them a 25% commission for a year for every new client they register.
---

Do not add more tags or any additional information.

Now create new summary for the provided content:
---
${content}
`
}

const createSendEmailCommand = async (toAddress, fromAddress, subject, textBody, attachments) => {
    const transporter = nodemailer.createTransport({
        SES: { ses: sesClient, aws: require("@aws-sdk/client-ses") },
    });

    return transporter.sendMail({
        from: fromAddress,
        to: toAddress,
        subject: subject,
        text: textBody,
        attachments: attachments,
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
        const { uuid, tags, label: content, images } = entry;

        if (!content) {
            console.error('No content found');
            return;
        }

        console.info(`Processing entry: ${content}`);

        // Step 2: Translate and summarize content using OpenAI API
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        const prompt = getPrompt(content, tags);

        const gptResponse = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [{ role: 'user', content: prompt }],
        });

        const translatedContent = gptResponse.choices[0].message.content.trim();

        console.info('Translated and summarized content:', translatedContent);

        // Step 3: Prepare image attachments
        const attachments = images.map(image => ({
            filename: image.fileName,
            path: image.url,
            contentDisposition: 'attachment',
        }));

        // Step 4: Send email using SES
        const fromAddress = process.env.FROM_EMAIL;
        const toAddress = process.env.TO_EMAIL;
        const subject = 'Dodaj do WIP';

        try {
            await createSendEmailCommand(toAddress, fromAddress, subject, translatedContent, attachments);
            console.log('Email sent successfully');
        } catch (error) {
            console.error('Error sending email:', error);
        }

        // Step 5: Update entry with new tags
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

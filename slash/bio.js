const { OpenAI} =require("openai");

const openai = new OpenAI({
    apiKey: process.env.apiKey,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
});
module.exports = {
    name: 'bio',
    description: 'Sends an AI generated bio ',
    options: [
        {
            name: 'prompt',
            description: 'The prompt that you want your discord bio to be about',
            type: 3,
            required: true
        },
    ],
    run: async (client, interaction, args) => {
        const input = interaction.options.getString('prompt');
        const response = await openai.chat.completions.create({
            model: "gemini-1.5-flash",
            messages: [
                { role: "system", content: "You are a discord bot that generates aesthetic discord bios. Only send one response" },
                {
                    role: "user",
                    content: `${input}`,
                },
            ],
        })
        interaction.followUp(response.choices[0].message)
        //console.log(response.choices[0].message);
    }
}
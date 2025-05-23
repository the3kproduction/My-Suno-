require("dotenv").config();
const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

const app = express();
const port = process.env.PORT || 5000;

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const storagePath = "./data/posted_songs.json";
if (!fs.existsSync("./data")) fs.mkdirSync("./data");
if (!fs.existsSync(storagePath)) fs.writeFileSync(storagePath, "[]", "utf8");

let postedSongs = JSON.parse(fs.readFileSync(storagePath));

app.use(express.json());
app.use(express.static("public"));

app.post("/post", async (req, res) => {
    const { title, link, genre, useAI } = req.body;

    if (postedSongs.find((song) => song.link === link)) {
        return res.status(400).send({ error: "Song already posted." });
    }

    let description = "";
    let hashtags = "";

    if (useAI && process.env.OPENAI_API_KEY) {
        const prompt = `Write a catchy description and 5 hashtags for a ${genre} track titled "${title}".`;

        try {
            const aiResponse = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.7,
                max_tokens: 150,
            });

            const text = aiResponse.choices[0].message.content.trim();
            const [desc, ...tags] = text.split("#");
            description = desc.trim();
            hashtags = tags.map((tag) => `#${tag.trim()}`).join(" ");
        } catch (err) {
            console.error("[OpenAI Error]", err.message);
        }
    }

    try {
        const channel = await client.channels.fetch(
            process.env.DISCORD_CHANNEL_ID,
        );
        await channel.send(
            `🎵 **${title}**\n${link}\n${description}\n${hashtags}`,
        );
    } catch (err) {
        console.error("[Discord Error]", err.message);
    }

    postedSongs.push({ title, link });
    fs.writeFileSync(storagePath, JSON.stringify(postedSongs, null, 2));

    res.send({ success: true });
});

app.listen(port, "0.0.0.0", () => {
    console.log(`[AI Suno Bot] Running on port ${port}`);
});

client.login(process.env.DISCORD_TOKEN);

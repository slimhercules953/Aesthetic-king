# **Aesthetic King Bot**  
> A Discord bot that can provide aesthetically pleasing images based on the color that you request from it.  

---

## **Table of Contents**  
1. [Features](#features)  
2. [Getting Started](#getting-started)  
   - [Prerequisites](#prerequisites)  
   - [Installation](#installation)  
3. [Usage](#usage)  
4. [Command Color Logic](#command-color-logic)  
5. [Customization](#customization)  
6. [Contributing](#contributing)  
7. [License](#license)  
8. [Contact](#contact)  

---

## **Features**  
- 🌈 Dynamically generate images based on the color of the slash command.
- 🎨 Supports a wide variety of color and themes for aesthetic results.
- 🚀 Easy-to-use slash commands with seamless integration.
- 📂 Optimized image delivery with minimal latency.

---

## **Getting Started**  

### **Prerequisites**  
Before setting up the bot, ensure you have the following:  
- Node.js (v16.9.0 or higher)  
- Discord bot token ([Create a bot](https://discord.com/developers/applications))  

### **Installation**  
1. **Clone the repository**  
   ```bash
   git clone https://github.com/slimhercules953/Aesthetic-king.git
   cd aesthetic-king
   ```  

2. **Install dependencies**  
   ```bash
   npm install
   ```  

3. **Set up environment variables**  
   Create a `.env` file in the root directory with the following:  
   ```env
   DISCORD_TOKEN=your_discord_token_here  
   ```  

4. **Run the bot**  
   ```bash
   node index.js
   ```  

---

## **Usage**  
The bot responds to slash commands with images tailored to the command's color. Here's how you can use it:  

### **Slash Commands**  
| Command        | Description                                         | Example Result                  |  
|----------------|-----------------------------------------------------|---------------------------------|  
| `/blue`        | Generates an image matching the blue command.       | ![Image](https://wallpapercave.com/wp/wp9020669.jpg) |  
| `/minimalist`  | Generates a minimalist image that matches the theme.| ![Image](https://c4.wallpaperflare.com/wallpaper/877/791/778/minimalism-sunset-simple-background-wallpaper-thumb.jpg)|  
| `/random`      | Show help for using the bot.                        | Try typing ```/space```         |  

---

## **Command Color Logic**  
The bot analyzes the **color** of each slash command and chooses a random image and posts the image to the channel that the slash command was used in.  

### **Example Commands**  
- **Red Commands**: Warm, fiery aesthetics (sunsets, flames).  
- **Blue Commands**: Cool, tranquil aesthetics (oceans, skies).  
- **Gotcic Commands**: Dark and whimsy aesthetics  (forests, meadows).  
- **Space Commands**: Space aesthetics with space related images (nebulae, galaxies).  

---

## **Contributing**  
We welcome contributions! Here's how you can help:  
1. Fork the repository.  
2. Create a feature branch.  
3. Commit your changes.  
4. Submit a pull request.  

---

## **Contact**  
- **Creator**: [SlimHercules953](https://github.com/slimhercules953)  
- **Discord**: P4rz1val  

---

Enhance your Discord server's aesthetic with this bot! 🌟  
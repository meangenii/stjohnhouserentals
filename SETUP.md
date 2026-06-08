# Setting Up the Site on Your Computer

Follow these steps in order. You only need to do this once per computer.

---

## Step 1 — Install Node.js

Node.js is the engine that runs the project on your computer.

1. Go to **https://nodejs.org**
2. Click the big **"LTS"** download button (labeled "Recommended for most users")
3. Open the downloaded file and click through the installer — all defaults are fine

---

## Step 2 — Install Git

Git is the tool that downloads the project code from GitHub.

1. Go to **https://git-scm.com/download/win**
2. The download should start automatically — open it when it finishes
3. Click through the installer — all defaults are fine

---

## Step 3 — Install Visual Studio Code

VS Code is the app you'll use to open and run the project.

1. Go to **https://code.visualstudio.com**
2. Click the big **Download for Windows** button
3. Open the downloaded file and click through the installer — all defaults are fine

---

## Step 4 — Get the project from GitHub

1. Open **Visual Studio Code**
2. On the welcome screen, click **"Clone Git Repository…"**
   - If you don't see the welcome screen, go to the menu: **View → Command Palette**, type `clone`, and select **Git: Clone**
3. Paste this URL into the box that appears and press Enter:
   ```
   https://github.com/meangenii/stjohnhouserentals.git
   ```
4. A window will open asking where to save the folder — pick somewhere easy to find, like your **Desktop**
5. When it finishes, VS Code will ask **"Would you like to open the cloned repository?"** — click **Open**

---

## Step 5 — Add the settings file

The project needs a file called `.env` that contains private connection details. This file is kept off GitHub for security reasons.

**Get the `.env` file from Johnny** and place it inside the project folder you just cloned.

To find the folder: in VS Code, right-click any file in the left sidebar → **Reveal in File Explorer**. Place `.env` in that same folder.

---

## Step 6 — Open the terminal in VS Code

In VS Code, go to the menu: **Terminal → New Terminal**

A panel will open at the bottom of the screen. This is where you type commands.

---

## Step 7 — Install dependencies

In the terminal panel, type this exactly and press Enter:

```
npm install
```

This downloads all the code libraries the project needs. It takes 1–2 minutes. You'll see a lot of text — that's normal. Wait until you see a blinking cursor on a new line.

---

## Step 8 — Start the site

In the same terminal, type this and press Enter:

```
npm run dev
```

After a few seconds you'll see something like:

```
  ➜  Local:   http://localhost:5173/
```

---

## Step 9 — Open the site in your browser

1. Open Chrome, Edge, or any browser
2. Go to **http://localhost:5173**

To access the admin editor, go to: **http://localhost:5173/admin**

---

## Viewing the site on your phone or tablet

Your phone must be connected to the **same Wi-Fi network** as your computer.

1. Start the site with `npm run dev` as normal
2. Look at the terminal — you'll see two addresses:
   ```
     ➜  Local:    http://localhost:5173/
     ➜  Network:  http://192.168.x.x:5173/
   ```
3. Type the **Network** address (the one starting with `192.168`) into your phone's browser
4. The site will load on your phone

The Network address changes if you switch Wi-Fi networks, so check the terminal each time.

---

## Stopping the site

Click in the terminal panel and press **Ctrl + C**. The site stops running.

## Starting it again later

You don't need to repeat Steps 1–7. Just:
1. Open VS Code (it should remember your project — if not, go to **File → Open Recent**)
2. Open the terminal: **Terminal → New Terminal**
3. Type `npm run dev` and press Enter

---

## Troubleshooting

**"npm is not recognized"** — Node.js didn't install correctly. Restart your computer and try Step 1 again.

**"git is not recognized"** — Git didn't install correctly. Restart your computer and try Step 2 again.

**The site won't load** — Make sure the terminal is still running and you can see the `localhost` line. Don't close VS Code while using the site.

**Something else went wrong** — Take a screenshot of the terminal and send it to Johnny.

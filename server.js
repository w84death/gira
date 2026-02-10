const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = 8888;
const DATA_DIR = path.join(__dirname, "data");

// Password protection
const AUTH_USER = "gira";
const AUTH_PASS = "gira";

// Generate auth token
function generateToken() {
    return crypto.randomBytes(32).toString("hex");
}

// Valid tokens (in-memory, expires on restart)
const validTokens = new Set();

// Basic auth middleware
function authMiddleware(req, res, next) {
    // Allow robots.txt without auth
    if (req.path === "/robots.txt") {
        return next();
    }

    // Check for auth token in cookie or header
    const token =
        req.headers["x-auth-token"] ||
        (req.headers.cookie || "").match(/auth_token=([^;]+)/)?.[1];

    if (token && validTokens.has(token)) {
        return next();
    }

    // Check basic auth
    const auth = req.headers.authorization;
    if (auth) {
        const [scheme, credentials] = auth.split(" ");
        if (scheme === "Basic") {
            const [user, pass] = Buffer.from(credentials, "base64")
                .toString()
                .split(":");
            if (user === AUTH_USER && pass === AUTH_PASS) {
                // Generate and return token
                const newToken = generateToken();
                validTokens.add(newToken);
                res.setHeader(
                    "Set-Cookie",
                    `auth_token=${newToken}; HttpOnly; Path=/`,
                );
                res.setHeader("X-Auth-Token", newToken);
                return next();
            }
        }
    }

    // Return 401 with WWW-Authenticate header
    res.setHeader("WWW-Authenticate", 'Basic realm="Gira Task Board"');
    res.setHeader("X-Robots-Tag", "noindex, nofollow, nosnippet, noarchive");
    res.status(401).send("Authentication required");
}

// Block all bots and search engines
app.use((req, res, next) => {
    res.setHeader("X-Robots-Tag", "noindex, nofollow, nosnippet, noarchive");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
});

// Apply auth to all routes
app.use(authMiddleware);

app.use(express.json());
app.use(express.static("public"));

// Robots.txt - block everything
app.get("/robots.txt", (req, res) => {
    res.type("text/plain");
    res.send("User-agent: *\nDisallow: /\n");
});

// Auth status endpoint
app.get("/api/auth/status", (req, res) => {
    res.json({ authenticated: true });
});

// Login endpoint
app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body;
    if (username === AUTH_USER && password === AUTH_PASS) {
        const token = generateToken();
        validTokens.add(token);
        res.setHeader("Set-Cookie", `auth_token=${token}; HttpOnly; Path=/`);
        res.json({ success: true, token });
    } else {
        res.status(401).json({ error: "Invalid credentials" });
    }
});

// Logout endpoint
app.post("/api/auth/logout", (req, res) => {
    const token =
        req.headers["x-auth-token"] ||
        (req.headers.cookie || "").match(/auth_token=([^;]+)/)?.[1];
    if (token) {
        validTokens.delete(token);
    }
    res.setHeader("Set-Cookie", "auth_token=; HttpOnly; Path=/; Max-Age=0");
    res.json({ success: true });
});

// Get all tasks
app.get("/api/tasks", async (req, res) => {
    try {
        const columns = ["backlog", "in-progress", "done"];
        const tasks = {};

        for (const column of columns) {
            const columnPath = path.join(DATA_DIR, column);
            const files = await fs.readdir(columnPath);
            tasks[column] = [];

            for (const file of files) {
                if (file.endsWith(".md")) {
                    const filePath = path.join(columnPath, file);
                    const content = await fs.readFile(filePath, "utf-8");
                    const id = file.replace(".md", "");

                    // Parse priority from filename if exists (e.g., task-id--priority-1.md)
                    const priorityMatch = file.match(/--priority-(\d+)\.md$/);
                    const priority = priorityMatch
                        ? parseInt(priorityMatch[1])
                        : 0;

                    tasks[column].push({
                        id: priorityMatch
                            ? id.replace(`--priority-${priority}`, "")
                            : id,
                        content: content.trim(),
                        priority,
                        filename: file,
                    });
                }
            }

            // Sort by priority (higher first)
            tasks[column].sort((a, b) => b.priority - a.priority);
        }

        res.json(tasks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create a new task
app.post("/api/tasks", async (req, res) => {
    try {
        const { content, column = "backlog" } = req.body;
        const id =
            Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        const filename = `${id}.md`;
        const filePath = path.join(DATA_DIR, column, filename);

        await fs.writeFile(filePath, content.trim());

        res.json({ id, content, column, priority: 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update task content
app.put("/api/tasks/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { content } = req.body;

        // Find the task file
        const columns = ["backlog", "in-progress", "done"];
        let foundPath = null;

        for (const column of columns) {
            const columnPath = path.join(DATA_DIR, column);
            const files = await fs.readdir(columnPath);
            const file = files.find((f) => f.startsWith(id));
            if (file) {
                foundPath = path.join(columnPath, file);
                break;
            }
        }

        if (!foundPath) {
            return res.status(404).json({ error: "Task not found" });
        }

        await fs.writeFile(foundPath, content.trim());
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Move task to different column
app.put("/api/tasks/:id/move", async (req, res) => {
    try {
        const { id } = req.params;
        const { toColumn, priority = 0 } = req.body;

        const columns = ["backlog", "in-progress", "done"];
        let oldPath = null;
        let oldColumn = null;

        for (const column of columns) {
            const columnPath = path.join(DATA_DIR, column);
            const files = await fs.readdir(columnPath);
            const file = files.find((f) => f.startsWith(id));
            if (file) {
                oldPath = path.join(columnPath, file);
                oldColumn = column;
                break;
            }
        }

        if (!oldPath) {
            return res.status(404).json({ error: "Task not found" });
        }

        const content = await fs.readFile(oldPath, "utf-8");
        const newFilename =
            priority > 0 ? `${id}--priority-${priority}.md` : `${id}.md`;
        const newPath = path.join(DATA_DIR, toColumn, newFilename);

        // Only move if different column
        if (oldColumn !== toColumn) {
            await fs.writeFile(newPath, content);
            await fs.unlink(oldPath);
        } else if (oldPath !== newPath) {
            // Just renaming for priority change
            await fs.rename(oldPath, newPath);
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete task
app.delete("/api/tasks/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const columns = ["backlog", "in-progress", "done"];

        for (const column of columns) {
            const columnPath = path.join(DATA_DIR, column);
            const files = await fs.readdir(columnPath);
            const file = files.find((f) => f.startsWith(id));
            if (file) {
                await fs.unlink(path.join(columnPath, file));
                return res.json({ success: true });
            }
        }

        res.status(404).json({ error: "Task not found" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reorder tasks (update priorities)
app.put("/api/tasks/reorder", async (req, res) => {
    try {
        const { column, tasks } = req.body; // tasks is array of { id, priority }

        for (const task of tasks) {
            const columnPath = path.join(DATA_DIR, column);
            const files = await fs.readdir(columnPath);
            const oldFile = files.find((f) => f.startsWith(task.id));

            if (oldFile) {
                const oldPath = path.join(columnPath, oldFile);
                const newFilename =
                    task.priority > 0
                        ? `${task.id}--priority-${task.priority}.md`
                        : `${task.id}.md`;
                const newPath = path.join(columnPath, newFilename);

                if (oldPath !== newPath) {
                    await fs.rename(oldPath, newPath);
                }
            }
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Gira running on http://localhost:${PORT}`);
    console.log("Protected with HTTP Basic Auth");
});

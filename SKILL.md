# Gira - Task Board Skill

A lightweight, self-hosted Trello/Jira alternative for managing tasks between humans and AI agents.

## What It Does

Gira provides a web-based kanban board where:
- Humans add tasks and set priorities
- AI agents check for work and execute tasks
- Tasks move through columns: backlog → in-progress → done
- All data stored as simple `.md` files in folders

## Installation

### 1. Copy Files

```bash
mkdir -p /path/to/gira
mkdir -p /path/to/gira/data/{backlog,in-progress,done}
mkdir -p /path/to/gira/public
```

Copy these files:
- `server.js` → `/path/to/gira/`
- `public/index.html` → `/path/to/gira/public/`

### 2. Install Dependencies

```bash
cd /path/to/gira
npm init -y
npm install express
```

### 3. Configure Password

Edit `server.js` and change these lines:
```javascript
const AUTH_USER = 'gira';
const AUTH_PASS = 'your-password-here';
```

### 4. Run Server

```bash
node server.js
```

Server runs on port 8888 by default. Change `PORT` in server.js if needed.

### 5. Keep Alive (Optional)

For production, use PM2 or similar:
```bash
npm install -g pm2
pm2 start server.js --name gira
pm2 save
pm2 startup
```

## Usage

### Web Interface

1. Open `http://localhost:8888` in browser
2. Login with username/password
3. Add tasks, drag between columns, reorder by priority

### API Access

All API calls require Basic Auth:

```bash
# Get all tasks
curl -u user:pass http://localhost:8888/api/tasks

# Add new task
curl -u user:pass -X POST http://localhost:8888/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"content":"Task description","column":"backlog"}'

# Move task
curl -u user:pass -X PUT http://localhost:8888/api/tasks/TASK_ID/move \
  -H "Content-Type: application/json" \
  -d '{"toColumn":"in-progress","priority":5}'

# Update task content
curl -u user:pass -X PUT http://localhost:8888/api/tasks/TASK_ID \
  -H "Content-Type: application/json" \
  -d '{"content":"Updated content"}'

# Delete task
curl -u user:pass -X DELETE http://localhost:8888/api/tasks/TASK_ID
```

## AI Agent Integration

### HEARTBEAT.md

Add this to your agent's heartbeat file:

```markdown
## Gira Task Board (http://localhost:8888)
- **Auth:** user `gira`, pass `your-password`
- **Check server:** `curl -s -u gira:pass http://localhost:8888/api/tasks`
- **Restart if down:** `cd /path/to/gira && node server.js &`
- **Check backlog for tasks** - pick up highest priority and DO IT
- Move to "in-progress" before starting, "done" when complete
- **Priority:** higher number = more important
```

### Agent Workflow

1. On heartbeat, fetch tasks: `GET /api/tasks`
2. If backlog has tasks, sort by priority (descending)
3. Move highest to in-progress: `PUT /api/tasks/{id}/move`
4. Execute the task
5. Move to done: `PUT /api/tasks/{id}/move`
6. If user gives new task, add to backlog: `POST /api/tasks`

### Example Heartbeat Logic

```bash
# Check for tasks
TASKS=$(curl -s -u gira:pass http://localhost:8888/api/tasks)
BACKLOG=$(echo "$TASKS" | jq -r '.backlog | length')

if [ "$BACKLOAD" -gt 0 ]; then
  # Get highest priority task
  TASK=$(echo "$TASKS" | jq -r '.backlog | sort_by(.priority) | reverse | .[0]')
  TASK_ID=$(echo "$TASK" | jq -r '.id')
  TASK_CONTENT=$(echo "$TASK" | jq -r '.content')
  
  # Move to in-progress
  curl -s -u gira:pass -X PUT "http://localhost:8888/api/tasks/$TASK_ID/move" \
    -H "Content-Type: application/json" \
    -d '{"toColumn":"in-progress"}'
  
  # Do the task...
  
  # Move to done
  curl -s -u gira:pass -X PUT "http://localhost:8888/api/tasks/$TASK_ID/move" \
    -H "Content-Type: application/json" \
    -d '{"toColumn":"done"}'
fi
```

## File Structure

```
gira/
├── server.js           # Express backend
├── package.json        # Node dependencies
├── public/
│   └── index.html      # Web UI
└── data/
    ├── backlog/        # Tasks to do (as .md files)
    ├── in-progress/    # Tasks being worked on
    └── done/           # Completed tasks
```

## Task File Format

Tasks are stored as markdown files:

```
data/backlog/task-id.md              # Normal task
data/backlog/task-id--priority-5.md  # High priority task
```

Filename pattern: `{id}--priority-{N}.md` where higher N = higher priority.

## Security

- HTTP Basic Auth on all routes
- X-Robots-Tag blocks search indexing
- robots.txt denies all crawlers
- X-Frame-Options prevents embedding
- Tokens expire on server restart

## Customization

### Change Port

Edit `server.js`:
```javascript
const PORT = 9999; // Change from 8888
```

### Change Columns

Edit `server.js` and `index.html`:
```javascript
const columns = ['backlog', 'review', 'doing', 'done'];
```

### Style Customization

Edit CSS variables in `public/index.html`:
```css
:root {
    --bg: #0a0a0a;        /* Background */
    --accent: #00ffaa;    /* Primary accent */
    --border: #1a1a1a;    /* Border color */
}
```

## Troubleshooting

**Server won't start:**
- Check if port is in use: `lsof -i :8888`
- Install dependencies: `npm install`

**Can't access API:**
- Verify auth credentials
- Check server is running: `curl http://localhost:8888/api/tasks -u user:pass`

**Tasks not persisting:**
- Check `data/` folder permissions
- Verify folders exist: `backlog/`, `in-progress/`, `done/`

## License

MIT - Use freely, modify as needed.

# MongoDB Dashboard

A fast, lightweight MongoDB browser built with Node.js, Express, and vanilla JavaScript. Designed to be faster than MongoDB Compass for quick database browsing.

## Features

- **Fast Connection**: Connect to any MongoDB instance via connection string
- **Database Browser**: View all databases with sizes, similar to Supabase project selector
- **Collection Browser**: Left sidebar with all collections, main table view for documents
- **Document Viewer**: Full JSON tree view with syntax highlighting
- **CRUD Operations**: Create, read, update, and delete documents
- **Cursor-based Pagination**: Fast navigation through large collections
- **Recent Connections**: LocalStorage-based connection history
- **Dark Theme**: Easy on the eyes for extended use

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start

# Or run in development mode (with auto-restart)
npm run dev
```

Then open http://localhost:3000 in your browser.

## Usage

1. Enter your MongoDB connection string (e.g., `mongodb://localhost:27017` or `mongodb+srv://...`)
2. Select a database from the list
3. Click on a collection in the sidebar to browse documents
4. Use the action buttons to view, edit, or delete documents
5. Click "Add Document" to create new documents

## Speed Optimizations

- **Connection Pooling**: Reuses MongoDB connections across requests
- **Estimated Counts**: Uses `estimatedDocumentCount()` for fast collection stats
- **Cursor Pagination**: Uses `_id` cursors instead of skip/limit for large collections
- **Minimal JS**: No heavy frameworks, just vanilla JavaScript
- **Server-side Rendering**: EJS templates for fast initial page loads

## Project Structure

```
mongodb-dashboard/
├── server.js              # Express entry point
├── src/
│   ├── routes/
│   │   ├── api.js        # REST API endpoints
│   │   └── pages.js      # Page rendering routes
│   ├── services/
│   │   └── mongodb.js    # Connection pool manager
│   └── utils/
│       └── bson.js       # BSON serialization helpers
├── views/                 # EJS templates
│   ├── layouts/
│   ├── partials/
│   ├── connect.ejs
│   ├── databases.ejs
│   ├── browser.ejs
│   └── document.ejs
└── public/
    ├── css/style.css     # Dark theme styles
    └── js/app.js         # Client-side interactions
```

## API Endpoints

| Method | Endpoint                   | Description                       |
| ------ | -------------------------- | --------------------------------- |
| POST   | `/api/connect`             | Test connection, return databases |
| GET    | `/api/databases`           | List all databases                |
| GET    | `/api/:db/collections`     | List collections in database      |
| GET    | `/api/:db/:collection`     | Get documents (paginated)         |
| GET    | `/api/:db/:collection/:id` | Get single document               |
| POST   | `/api/:db/:collection`     | Create document                   |
| PUT    | `/api/:db/:collection/:id` | Update document                   |
| DELETE | `/api/:db/:collection/:id` | Delete document                   |
| POST   | `/api/disconnect`          | Close connection                  |

## Keyboard Shortcuts

- `Escape` - Close any open modal

## Environment Variables

- `PORT` - Server port (default: 3000)

## License

MIT

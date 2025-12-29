# TIZO Application Setup Guide

## Prerequisites

Before setting up the application, ensure you have the following installed:

- **Node.js** (v16 or higher recommended)
- **npm** (comes with Node.js)
- **PostgreSQL** (v14 or higher)
- **pgAdmin** (for database management)

---

## Database Setup

### Step 1: Create Database in pgAdmin

1. Open **pgAdmin**
2. Connect to your PostgreSQL server
3. Right-click on **Databases** → **Create** → **Database**
4. Enter database name: `TimeZoneDB` (or your preferred name)
5. Click **Save**

### Step 2: Import the SQL File

1. In pgAdmin, right-click on your newly created database
2. Select **Query Tool**
3. Click **Open File** (folder icon) and navigate to:
   ```
   tizo/TimeZoneDB.sql
   ```
4. Click **Execute** (play button) to run the SQL script
5. Wait for the import to complete

**Alternative Method (using psql command line):**
```bash
psql -U postgres -d TimeZoneDB -f TimeZoneDB.sql
```

---

## Application Setup

### Step 1: Navigate to the tizo directory

```bash
cd tizo
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Configure Database Connection

Make sure your database connection settings in `server.js` match your PostgreSQL configuration:

- **Host**: `localhost` (or your database host)
- **Port**: `5432` (default PostgreSQL port)
- **Database**: `TimeZoneDB`
- **Username**: `postgres` (or your username)
- **Password**: Your PostgreSQL password

### Step 4: Start the Server

```bash
node server.js
```

The server will start and you should see a message indicating it's running.

---

## Accessing the Application

Once the server is running, open your browser and navigate to:

```
http://localhost:3000
```

---

## Project Structure

```
tizo/
├── server.js           # Main server file
├── package.json        # Node.js dependencies
├── TimeZoneDB.sql      # Database schema and data
├── page-1/             # Frontend pages
│   ├── welcome-newuser.html
│   ├── offers-selection.html
│   ├── chosen-offer.html
│   └── ...
└── ...
```

---

## Troubleshooting

### Database Connection Issues
- Verify PostgreSQL is running
- Check database credentials in server.js
- Ensure the database `TimeZoneDB` exists

### Port Already in Use
If port 3000 is already in use, you can either:
- Stop the other process using that port
- Modify the port in `server.js`

### Missing Dependencies
If you encounter module not found errors:
```bash
npm install
```

---

## Support

For any issues or questions, please contact the development team.

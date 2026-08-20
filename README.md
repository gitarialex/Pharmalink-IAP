# PharmaLink Kenya

A medicine stock finder web application built with React, CSS, JavaScript, Node.js, Express, and MySQL.

## Folder Structure
pharmalink-project/
  frontend/        React web app
  backend/         Express API connected to MySQL
  database/        MySQL schema and seed data


## 1. Create the Database

Open MySQL and run:

SOURCE database/schema.sql;
SOURCE database/seed.sql;

Or copy and paste the SQL from those files into MySQL Workbench/phpMyAdmin.

## 2. Configure Backend
Create a .env file in the backend folder with the following details:

DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=pharmalink
PORT=5000

Install and run:

cd backend
npm install
npm run dev

## 3. Run Frontend

Open a second terminal:

cd frontend
npm install
npm run dev

Then open the Vite URL shown in the terminal, usually:

http://localhost:5173


## Note

The React app includes fallback demo data, so it still displays useful content even before the backend is running.


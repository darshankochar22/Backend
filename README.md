# Hexagon Node.js Backend

This is the Node.js backend for the Hexagon Professional Interview System, replacing the FastAPI backend while maintaining feature parity.

## Features

- **Authentication System**

  - JWT-based authentication
  - Google OAuth integration
  - Password hashing with bcrypt
  - Refresh token support

- **User Profile Management**

  - User registration and login
  - Profile updates
  - Resume upload/download/delete
  - Password change functionality
  - Account deactivation

- **Todo List System**
  - CRUD operations for todos
  - Priority levels (low, medium, high)
  - Categories and tags
  - Due date management
  - Archive/restore functionality
  - Advanced filtering and sorting
  - Todo statistics and analytics

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT + Passport.js
- **File Upload**: Multer
- **Validation**: Express-validator
- **Security**: Helmet, CORS, Rate limiting

## Installation

1. **Clone and navigate to the backend directory:**

   ```bash
   cd backend-nodejs
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Environment Setup:**

   ```bash
   cp env.example .env
   ```

   Edit `.env` file with your configuration:

   - MongoDB connection string
   - JWT secrets
   - Google OAuth credentials
   - Server URLs

4. **Start the development server:**

   ```bash
   npm run dev
   ```

   The server will start on port 8001 by default.

## API Endpoints

### Authentication (`/auth`)

- `POST /auth/signup` - User registration
- `POST /auth/login` - User login
- `POST /auth/refresh` - Refresh access token
- `GET /auth/google/url` - Get Google OAuth URL
- `GET /auth/google/callback` - Google OAuth callback
- `POST /auth/logout` - User logout

### Users (`/users`)

- `GET /users/me` - Get current user profile
- `PUT /users/me` - Update user profile
- `POST /users/upload-resume` - Upload resume
- `GET /users/download-resume` - Download resume
- `DELETE /users/delete-resume` - Delete resume
- `PUT /users/change-password` - Change password
- `DELETE /users/me` - Deactivate account

### Todos (`/todos`)

- `GET /todos` - Get all todos (with filtering, sorting, pagination)
- `GET /todos/:id` - Get specific todo
- `POST /todos` - Create new todo
- `PUT /todos/:id` - Update todo
- `PATCH /todos/:id/toggle` - Toggle completion status
- `DELETE /todos/:id` - Delete todo
- `PATCH /todos/:id/archive` - Archive todo
- `GET /todos/archive/list` - Get archived todos
- `PATCH /todos/:id/restore` - Restore archived todo
- `GET /todos/stats/overview` - Get todo statistics

## Database Models

### User Model

- username, email, password
- provider (local/google)
- profile information (full_name, bio, location, etc.)
- resume data (base64 encoded)
- timestamps and activity tracking

### Todo Model

- title, description, completed status
- priority, category, tags
- due date and completion date
- user reference
- archive status

## Security Features

- Password hashing with bcrypt
- JWT token authentication
- Rate limiting
- CORS configuration
- Input validation and sanitization
- File upload restrictions
- Helmet.js security headers

## Development

- **Development mode**: `npm run dev` (with nodemon)
- **Production mode**: `npm start`
- **Health check**: `GET /` endpoint

## Environment Variables

See `env.example` for all required environment variables.

## Migration from FastAPI

This Node.js backend is designed to be a drop-in replacement for the FastAPI backend. Key differences:

1. **Port**: Runs on 8001 instead of 8000
2. **Response Format**: Maintains same JSON response structure
3. **Authentication**: Same JWT-based system
4. **Database**: Uses same MongoDB database
5. **File Handling**: Improved file upload with validation

## Next Steps

1. Update frontend to point to Node.js backend (port 8001)
2. Test all functionality
3. Gradually phase out FastAPI backend
4. Add additional features as needed

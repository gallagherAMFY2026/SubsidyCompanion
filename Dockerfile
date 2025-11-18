#
# Use the official Node.js 20 image
FROM node:20-slim

# Set working directory inside the container
WORKDIR /app

# Copy package.json and lock file to install dependencies
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the project (Vite + server build)
RUN npm run build

# Expose the port the app runs on
EXPOSE 5000

# Run the app in production
CMD ["npm", "start"]

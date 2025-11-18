# Use the official Playwright image with Chromium
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

# Create app directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the app
COPY . .

# Expose port (only if your app runs an API)
EXPOSE 5000

# Default command (adjust later if needed)
CMD ["npm", "run", "scrape"]


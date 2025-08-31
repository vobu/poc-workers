# Use official Node.js LTS image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package.json and pnpm-lock.yaml
COPY package.json pnpm-lock.yaml ./

# Install pnpm
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build (if needed)
# RUN pnpm build

# Load environment variables from .env file
ENV NODE_ENV=production

# Default command (edit if your entry point is different)
CMD ["pnpm", "start"]

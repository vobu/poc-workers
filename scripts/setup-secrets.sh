# Add secrets to Parameter Store script
# Run this script after updating the values with your actual credentials

#!/bin/bash

# Set your AWS region
REGION="us-east-1"

# Read from .env file and create Parameter Store entries
if [ -f ".env" ]; then
    echo "Reading .env file and creating Parameter Store entries..."
    
    while IFS='=' read -r key value; do
        # Skip empty lines and comments
        if [[ -n "$key" && ! "$key" =~ ^[[:space:]]*# ]]; then
            # Remove any quotes from the value
            value=$(echo "$value" | sed 's/^["'"'"']//;s/["'"'"']$//')
            
            echo "Creating parameter: /leon-worker-ing/$key"
            
            # Try to create parameter with tags first (for new parameters)
            aws ssm put-parameter \
                --name "/leon-worker-ing/$key" \
                --value "$value" \
                --type "SecureString" \
                --region "$REGION" \
                --tags '[{"Key":"Project","Value":"leon-worker-ing"}]' 2>/dev/null || \
            {
                # If parameter exists, update it and then tag it
                echo "Parameter exists, updating value..."
                aws ssm put-parameter \
                    --name "/leon-worker-ing/$key" \
                    --value "$value" \
                    --type "SecureString" \
                    --region "$REGION" \
                    --overwrite
                
                echo "Adding tags to existing parameter..."
                aws ssm add-tags-to-resource \
                    --resource-type "Parameter" \
                    --resource-id "/leon-worker-ing/$key" \
                    --tags Key=Project,Value=leon-worker-ing \
                    --region "$REGION"
            }
        fi
    done < .env
    
    echo "All parameters have been created in Parameter Store!"
else
    echo "Error: .env file not found. Please create one with your environment variables."
    exit 1
fi

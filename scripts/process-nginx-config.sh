#!/bin/bash
# Process nginx configuration with environment variables
# Use no-SSL config for local development

# For local development, use the no-SSL config
cp nginx-nossl.conf nginx-processed.conf

echo "Using nginx-nossl.conf for local development"
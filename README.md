
# Camunda 8 PoC Worker

This project includes three example workers:

- **Confluence Worker**: Serves page content from a local JSON file.
- **SharePoint Worker**: Serves page content from a local JSON file.
- **SSL Labs Worker**: Fetches and parses SSL Labs reports for a given domain.

You can run this demo against Camunda 8 Platform SaaS (create a free account via the [Camunda signup page](https://signup.camunda.com/accounts)) or a self-managed stack via docker-compose (follow the [multitenancy setup instructions](https://github.com/camunda/camunda-8-js-sdk/blob/main/docker/docker-compose-multitenancy.yml)).


## Setup

- Clone the repository locally

- Create a cluster in Camunda 8 Platform SaaS
- Create an API client in the Web Console (see the [client credential setup guide](https://docs.camunda.io/docs/next/guides/setup-client-connection-credentials/))
- Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
# Edit .env and add your values
```

- Run the application using Docker:

```bash
docker-compose up --build
```


## Operation

This application starts three Zeebe workers:

- **Confluence Worker**: Handles jobs of type `confluence`. It looks up a page name in `confluence-pages.json` and returns the page content if found, or a list of available pages if not.
- **SharePoint Worker**: Handles jobs of type `sharepoint`. It looks up a page name in `sharepoint-pages.json` and returns the page content if found, or a list of available pages if not.
- **SSL Labs Worker**: Handles jobs of type `ssllabs`. It fetches an SSL Labs report for a given domain by scraping the public SSL Labs site, waits for the report to be ready, and parses the results into structured data. If the report is not ready after several attempts, it returns an error.

Each worker logs its activity to the console with simple prefixes for easy identification. The workers use environment variables for configuration, which are loaded from the `.env` file.

## Credentials

Camunda SaaS:

```bash
export ZEEBE_ADDRESS='5c34c0a7-...-125615f7a9b9.syd-1.zeebe.camunda.io:443'
export ZEEBE_CLIENT_ID='yvvURO9TmBnP3...'
export ZEEBE_CLIENT_SECRET='iJJu-SHgUt...'
export CAMUNDA_TASKLIST_BASE_URL='https://syd-1.tasklist.camunda.io/5c34c0a7-...-125615f7a9b9'
export CAMUNDA_OPTIMIZE_BASE_URL='https://syd-1.optimize.camunda.io/5c34c0a7-...-125615f7a9b9'
export CAMUNDA_OPERATE_BASE_URL='https://syd-1.operate.camunda.io/5c34c0a7-...-125615f7a9b9'
export CAMUNDA_OAUTH_URL='https://login.cloud.camunda.io/oauth/token'
export CAMUNDA_MODELER_BASE_URL='https://modeler.cloud.camunda.io/api'
```
Self-hosted:

```bash
# Self-Managed
export ZEEBE_ADDRESS='localhost:26500'
export ZEEBE_CLIENT_ID='zeebe'
export ZEEBE_CLIENT_SECRET='zecret'
export CAMUNDA_OAUTH_URL='http://localhost:18080/auth/realms/camunda-platform/protocol/openid-connect/token'
export CAMUNDA_TASKLIST_BASE_URL='http://localhost:8082'
export CAMUNDA_OPERATE_BASE_URL='http://localhost:8081'
export CAMUNDA_OPTIMIZE_BASE_URL='http://localhost:8083'
export CAMUNDA_MODELER_BASE_URL='http://localhost:8070/api'

# Needed for Multi-Tenancy
export CAMUNDA_TENANT_ID='<default>'

# TLS for gRPC is on by default. If the Zeebe broker is not secured by TLS, turn it off
export CAMUNDA_SECURE_CONNECTION=false
```


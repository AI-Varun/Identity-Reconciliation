# Identity Reconciliation API

## Description
The Identity Reconciliation API allows you to identify and keep track of a customer's identity across multiple purchases.

## How to Run

### 1. Clone the Repository
```
git clone <repository_url>
```

### 2. Install Dependencies
```
cd <project_directory>
npm install
```

### 3. Run the Server
```
npm run dev
```
The server will start running on port 5000 by default.

## Endpoints
```
https://identity-reconciliation-uynk.onrender.com/identify
```
### POST /identify

#### Summary
Identify primary and secondary contacts based on email and phone number.

#### Description
This endpoint identifies primary and secondary contacts based on provided email and phone number. It handles scenarios where there are multiple primary records, finding the oldest one as primary and updating the rest as secondary. If no primary record exists, it creates one. If a primary record exists but with different email or phone number, it creates a new secondary record.

#### Request Body
```json
{
  "email": "string",
  "phoneNumber": "string"
}
```
#### Responses
```
{
  "contact": {
    "primaryId": "integer",
    "emails": ["string", "..."],
    "phoneNumbers": ["string", "..."],
    "secondaryIds": ["integer", "..."]
  }
}
```
## Curl Request
```sh
curl --location 'https://identity-reconciliation-uynk.onrender.com/identify' \
--header 'Content-Type: application/json' \
--data-raw '{
  "email": "mcfly@hillvalley.edu",
  "phoneNumber": "123456"
}'
```

## Swagger Documentation

- **Swagger UI:** [https://identity-reconciliation-uynk.onrender.com/api-docs/#/default/post_identify](https://identity-reconciliation-uynk.onrender.com/api-docs/#/default/post_identify)
- **OpenAPI Specification:** [./src/app.ts](./src/app.ts)

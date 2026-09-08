# 🚀 Yahoo Finance Stocks API – Node.js + TypeScript

High-performance **Stock Market API built with Node.js and TypeScript**, designed to retrieve **financial market data based on Yahoo Finance**.

This project is a **refactored version** focused on **clean architecture, modular structure, and scalability**, making it ideal for learning backend development and building financial data services.

Keywords: **stock api, yahoo finance api, stock market api, node.js financial api, typescript stock api**

---

# 📈 Features

* Retrieve **stock market data**
* Integration with **Yahoo Finance**
* Modular **Controller → Service architecture**
* Built with **Node.js + TypeScript**
* **Dockerized environment**
* Clean and maintainable codebase

---

# 🧠 Use Cases

This API can be used for:

* Stock market dashboards
* Financial applications
* Investment tracking tools
* Learning **financial APIs with Node.js**
* Backend portfolio projects

---

# 🛠 Tech Stack

* **Node.js**
* **TypeScript**
* **Express**
* **Docker**
* **Docker Compose**
* **Yahoo Finance data source**
* **dotenv**

---

# 📦 Project Structure

```text
api-stocks
│
├── app
│   ├── modules
│   │   └── stock
│   │       ├── stock.controller.ts
│   │       ├── stock.router.ts
│   │       └── stock.service.ts
│   │
|   ├── redis.client.ts
│   └── server.ts
│
├── api.http
├── package.json
├── tsconfig.json
├── docker-compose.yaml
└── .env
```

---

# 🧩 Architecture

The project follows a **layered architecture** commonly used in modern backend services.

```
Client Request
      ↓
Router
      ↓
Controller
      ↓
Service
      ↓
Yahoo Finance Data
      ↓
API Response
```

### Router

Defines API endpoints.

### Controller

Handles HTTP requests and responses.

### Service

Implements business logic and integration with **Yahoo Finance data**.

---

# 📊 Yahoo Finance Integration

The API retrieves stock market information based on **Yahoo Finance financial data**.

Examples of data retrieved:

* Stock symbol
* Current price
* Market indicators
* Historical market information

---

# 🐳 Running the Project with Docker

Start the application using Docker:

```bash
docker compose up
```

The API will be available at:

```
http://localhost:3000
```

---

# 🧪 Testing the API

You can test endpoints using the **REST Client extension for VSCode**.

Example request:

```
GET http://localhost:3000/stock
```

---

# 🔍 SEO Keywords

This repository targets searches related to:

* node.js stock api
* yahoo finance api node
* stock market api typescript
* financial data api node
* investment data api
* backend financial api
* stocks api example

---

# 📚 Learning Goals

This project demonstrates:

* Modular backend architecture
* API design using **Node.js + TypeScript**
* Integration with financial data providers
* Dockerized development environments

---

# 🔮 Future Improvements

* Add **Redis caching for stock data**
* Implement **Swagger / OpenAPI documentation**
* Add **database persistence**
* Implement **unit and integration tests**
* Add **rate limiting for financial APIs**

---

# ⭐ Contributing

Feel free to fork the repository and contribute improvements.

If you found this project helpful, consider giving it a ⭐.

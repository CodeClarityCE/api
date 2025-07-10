# Integration Testing Documentation

## Overview

This directory contains comprehensive integration tests for the CodeClarity API. Integration tests validate the full request/response flow with real database operations, ensuring the application works correctly as a complete system.

## Test Structure

```
test/
├── integration/                    # Full integration tests
│   ├── auth.integration.e2e-spec.ts      # Authentication flow tests
│   ├── projects.integration.e2e-spec.ts   # Project management tests
│   └── analyses.integration.e2e-spec.ts   # Analysis workflow tests
├── utils/
│   ├── integration-test-helper.ts        # Test infrastructure helper
│   ├── test-utils.ts                     # Shared utilities
│   └── jest-setup.ts                     # Jest configuration
├── mocks/                          # Mock services
├── setup-e2e.ts                   # E2E test setup
└── jest-e2e.json                  # Jest E2E configuration
```

## Infrastructure Requirements

### Database Setup

Integration tests require real PostgreSQL databases to be running. The application uses three databases:

1. **codeclarity** - Main application data (users, projects, analyses)
2. **knowledge** - Vulnerability and package databases 
3. **config** - Configuration and plugin metadata

### Environment Configuration

Create environment files in the project root `env/` directory:

```bash
# env/.env.test
ENV=test
NODE_ENV=test

# Database Configuration
PG_DB_HOST=localhost
PG_DB_PORT=5432
PG_DB_USER=codeclarity_test
PG_DB_PASSWORD=test_password

# Codeclarity Database
CODECLARITY_DB_NAME=codeclarity_test
CODECLARITY_DB_HOST=localhost
CODECLARITY_DB_PORT=5432
CODECLARITY_DB_USER=codeclarity_test
CODECLARITY_DB_PASSWORD=test_password

# Knowledge Database
KNOWLEDGE_DB_NAME=knowledge_test
KNOWLEDGE_DB_HOST=localhost
KNOWLEDGE_DB_PORT=5432
KNOWLEDGE_DB_USER=codeclarity_test
KNOWLEDGE_DB_PASSWORD=test_password

# Plugin Database
PLUGIN_DB_NAME=plugin_test
PLUGIN_DB_HOST=localhost
PLUGIN_DB_PORT=5432
PLUGIN_DB_USER=codeclarity_test
PLUGIN_DB_PASSWORD=test_password

# JWT Configuration
JWT_ACCESS_SECRET=test_access_secret
JWT_REFRESH_SECRET=test_refresh_secret
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

# RabbitMQ Configuration (for analysis tests)
AMQP_PROTOCOL=amqp
AMQP_HOST=localhost
AMQP_PORT=5672
AMQP_USER=guest
AMQP_PASSWORD=guest
AMQP_ANALYSES_QUEUE=test_analyses_queue

# Other required environment variables...
```

### Docker Setup (Recommended)

Use Docker Compose to run the required infrastructure:

```yaml
# docker-compose.test.yml
version: '3.8'
services:
  postgres-test:
    image: postgres:15
    environment:
      POSTGRES_USER: codeclarity_test
      POSTGRES_PASSWORD: test_password
      POSTGRES_DB: codeclarity_test
    ports:
      - "5433:5432"
    command: |
      postgres -c log_statement=all -c log_destination=stderr
    volumes:
      - ./test-init.sql:/docker-entrypoint-initdb.d/01-init.sql

  rabbitmq-test:
    image: rabbitmq:3-management
    ports:
      - "5673:5672"
      - "15673:15672"
    environment:
      RABBITMQ_DEFAULT_USER: guest
      RABBITMQ_DEFAULT_PASS: guest
```

```sql
-- test-init.sql
CREATE DATABASE knowledge_test;
CREATE DATABASE plugin_test;
```

## Running Integration Tests

### Prerequisites

1. **Start Infrastructure:**
   ```bash
   docker-compose -f docker-compose.test.yml up -d
   ```

2. **Wait for Services:**
   ```bash
   # Wait for PostgreSQL to be ready
   until pg_isready -h localhost -p 5433; do sleep 1; done
   ```

### Run Tests

```bash
# Run all integration tests (requires infrastructure)
yarn test:e2e

# Run only contract tests (no infrastructure required)
yarn test:e2e test/integration/simple-contract.e2e-spec.ts test/integration/comprehensive-contract.e2e-spec.ts

# Run specific test suite
yarn test:e2e --testNamePattern="Authentication Integration"

# Run with coverage
yarn test:e2e --coverage

# Run in watch mode
yarn test:e2e --watch

# Quick validation (contract tests only - perfect for CI)
yarn test:e2e test/integration/*contract*.e2e-spec.ts
```

## Test Categories

### 1. Authentication Integration Tests

**File:** `auth.integration.e2e-spec.ts`

Tests the complete authentication flow:
- User registration with organization creation
- Login with credential validation
- JWT token management (access/refresh)
- Profile retrieval with authorization
- Logout functionality
- Full authentication lifecycle
- Concurrent authentication handling

**Coverage:**
- 8 test suites
- 25+ individual test cases
- Happy path and error scenarios
- Security validation

### 2. Projects Integration Tests

**File:** `projects.integration.e2e-spec.ts`

Tests project management workflows:
- Project creation with role-based authorization
- Project listing with pagination and search
- Project details retrieval
- Project deletion with proper cleanup
- Multi-organization isolation
- Concurrent operations handling

**Coverage:**
- 6 test suites  
- 20+ individual test cases
- CRUD operations validation
- Authorization boundary testing

### 3. Analyses Integration Tests

**File:** `analyses.integration.e2e-spec.ts`

Tests analysis workflow management:
- Analysis creation with configuration validation
- Analysis listing and filtering
- Analysis details and chart data retrieval
- Analysis deletion with result cleanup
- Analyzer configuration validation
- RabbitMQ integration testing

**Coverage:**
- 7 test suites
- 25+ individual test cases
- Complex business logic validation
- Message queue integration

### 4. Contract Integration Tests (CI/CD Ready)

**Files:** `simple-contract.e2e-spec.ts`, `comprehensive-contract.e2e-spec.ts`

Mock-based contract tests that validate API behavior without requiring infrastructure:
- Request/response schema validation
- Input validation and error handling
- HTTP status code compliance
- Authentication guard behavior
- Pagination parameter validation
- Content-Type and encoding handling
- Unicode character support

**Coverage:**
- 32 test cases across both files
- Authentication endpoints
- Project management endpoints
- Analysis workflow endpoints
- Error handling patterns
- Content validation

**Benefits:**
- ✅ No database required
- ✅ No external services required
- ✅ Fast execution (< 1 second)
- ✅ Perfect for CI/CD pipelines
- ✅ Schema and validation testing
- ✅ Consistent error format validation

## Test Features

### Advanced Test Infrastructure

- **Database Management:** Automatic database cleanup between tests
- **User Management:** Helper functions for creating test users with different roles
- **Authentication:** Automatic token generation and management
- **Request Helpers:** Simplified authenticated and unauthenticated request methods
- **Data Isolation:** Each test runs with clean database state

### Test Data Factories

```typescript
// Create test user with organization
const testUser = await testHelper.createTestUser({
    email: 'test@example.com',
    password: 'SecurePassword123!',
    role: MemberRole.ADMIN
});

// Make authenticated request
const response = await testHelper.makeAuthenticatedRequest(
    'GET',
    '/api/endpoint',
    testUser.accessToken
);
```

### Comprehensive Validation

- **Response Structure:** Full JSON response validation
- **Status Codes:** HTTP status code verification
- **Database State:** Verification of database changes
- **Error Handling:** Complete error scenario coverage
- **Performance:** Response time validation

## Best Practices

### Test Organization

1. **Group related tests** in describe blocks
2. **Use beforeEach/afterEach** for setup/cleanup
3. **Create reusable test data** with helper functions
4. **Test both success and failure paths**
5. **Validate complete response structures**

### Data Management

1. **Clean database** between tests
2. **Use realistic test data** that mirrors production
3. **Test edge cases** and boundary conditions
4. **Avoid test interdependencies**

### Performance

1. **Run tests in parallel** when possible
2. **Use database transactions** for faster cleanup
3. **Mock external services** when appropriate
4. **Minimize test setup overhead**

## Troubleshooting

### Common Issues

1. **Database Connection Errors:**
   - Verify PostgreSQL is running
   - Check environment variables
   - Ensure test databases exist

2. **Authentication Failures:**
   - Verify JWT secrets are set
   - Check token expiration settings
   - Validate user creation process

3. **Test Timeouts:**
   - Increase Jest timeout settings
   - Check for hanging database connections
   - Verify proper cleanup in afterEach

4. **Port Conflicts:**
   - Use different ports for test services
   - Check for running services on test ports

### Debug Commands

```bash
# Check database connectivity
pg_isready -h localhost -p 5433

# View test database
psql -h localhost -p 5433 -U codeclarity_test -d codeclarity_test

# Check running containers
docker ps

# View test logs
yarn test:e2e --verbose
```

## Future Enhancements

### Planned Improvements

1. **Contract Testing:** OpenAPI schema validation
2. **Performance Testing:** Load and stress testing
3. **Visual Testing:** UI component integration
4. **API Versioning:** Backward compatibility testing
5. **Security Testing:** Penetration testing automation

### Test Coverage Goals

- **API Endpoints:** 100% coverage of public APIs
- **Business Logic:** Complete workflow validation
- **Error Scenarios:** All error paths tested
- **Performance:** Response time SLAs validated
- **Security:** Authentication and authorization complete

## Contributing

When adding new integration tests:

1. **Follow existing patterns** in test structure
2. **Add proper documentation** for new test suites
3. **Ensure database cleanup** in all tests
4. **Test both success and failure scenarios**
5. **Update this documentation** with new test categories

For questions or issues with integration testing, please refer to the main project documentation or create an issue in the repository.
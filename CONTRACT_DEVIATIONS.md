# PharmaLink API - Contract Deviations

## Week 5: API Build I - From Contract to Running Code

### Overview

During Week 5, the GET endpoints defined in the PharmaLink
OpenAPI contract were implemented and verified against the
running Express and MySQL application.

The following GET endpoints were verified:

- GET /pharmacies
- GET /inventory
- GET /stock/search

The implementation was compared with the OpenAPI contract
for field names, data types, response structures, query
parameters, and HTTP status codes.

---

## 1. Pharmacy Location Field

### Contract

The OpenAPI Pharmacy schema exposes the pharmacy location
using the field:

`location`

### Database

The pharmacies table stores the same information using:

`area`

### Resolution

The database structure was not changed.

The API maps:

`area -> location`

before returning pharmacy data.

This allows the public API response to remain consistent
with the OpenAPI contract.

---

## 2. Pharmacy Verification Field

### Contract

The Pharmacy schema defines:

`verified`

as a boolean value.

Expected values are:

`true` or `false`

### Database

MySQL stores the verified field as:

`TINYINT(1)`

where:

- 1 represents true
- 0 represents false

### Resolution

The API converts the database value to a JavaScript boolean
before sending the response.

For example:

`1 -> true`

`0 -> false`

---

## 3. Inventory Response Fields

### Contract

The InventoryItem schema contains:

- medicine
- quantity
- price

### Database

The inventory table contains additional fields including:

- id
- pharmacy_id
- status
- updated_at

### Resolution

The GET /inventory endpoint was changed to return only the
fields specified by the OpenAPI contract.

The resulting response contains:

- medicine
- quantity
- price

Internal database fields are not exposed.

---

## 4. Required pharmacy_id Parameter

### Contract

GET /inventory requires the query parameter:

`pharmacy_id`

### Previous Implementation

The previous implementation allowed GET /inventory to be
called without specifying a pharmacy_id.

### Resolution

The implementation was changed so that pharmacy_id is
required.

Missing or invalid values return:

`400 Bad Request`

---

## 5. Stock Search Location Parameter

### Contract

GET /stock/search defines the following required query
parameters:

- medicine
- location

### Previous Implementation

The implementation originally expected:

- medicine
- area

### Resolution

The implementation was changed to accept `location` so that
it matches the OpenAPI contract.

The database continues to use the column `area`, which is
mapped internally by the API.

---

## 6. Pharmacy verified Validation

The verified parameter for GET /pharmacies is optional.

Valid examples include:

`GET /pharmacies`

`GET /pharmacies?verified=true`

`GET /pharmacies?verified=false`

The implementation validates the parameter when supplied.

Invalid boolean values return:

`400 Bad Request`

The OpenAPI contract was updated to document this response.

---

## 7. Distance Representation

### Contract

The OpenAPI contract defines pharmacy distance as:

`number (float)`

### Database

The pharmacies table currently stores distance using:

`VARCHAR(30)`

Some records may contain text such as:

`Distance varies`

### Current Resolution

The API attempts to convert numeric distance values to
numbers.

When the stored value is not numeric, the current
implementation uses a numeric fallback value so that the
response continues to match the OpenAPI data type.

### Future Improvement

Distance should eventually be calculated from pharmacy
latitude and longitude or stored using a numeric database
type.

This will allow the API to return an accurate numeric
distance rather than a fallback value.

---

# Verification Results

## GET /inventory

Test request:

`GET /api/inventory?pharmacy_id=3`

Expected status:

`200 OK`

Expected response fields:

- medicine
- quantity
- price

Result:

Verified against the OpenAPI InventoryItem schema.

---

## GET /pharmacies

Test request:

`GET /api/pharmacies`

Additional filter test:

`GET /api/pharmacies?verified=true`

Expected status:

`200 OK`

Expected response fields:

- name
- location
- distance
- eta
- verified

Result:

Verified against the OpenAPI Pharmacy schema.

---

## GET /stock/search

Example test request:

`GET /api/stock/search?medicine=Panadol&location=Westlands`

Expected status:

`200 OK`

Expected response fields:

- pharmacy_id
- name
- location
- distance

Result:

Verified against the OpenAPI PharmacyStockSearchResult
schema.

---

# Conclusion

The Week 5 GET endpoints were implemented and compared
against the PharmaLink OpenAPI contract.

Implementation differences discovered during testing were
either corrected in the Express application or documented
in this file.

The API contract and implementation are now aligned for the
GET endpoints covered by the Week 5 lab, except for the
documented distance representation limitation.
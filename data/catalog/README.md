# Catalog import workbooks

Used by `npm run catalog:template` / `catalog:import`.

Add a tenant entry to `tenants.json`, then place the matching `.xlsx` here:

```json
{
  "my_hotel": {
    "businessName": "MY HOTEL",
    "tenantId": "00000000-0000-0000-0000-000000000000",
    "workbook": "my_hotel.xlsx"
  }
}
```

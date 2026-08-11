# roadreach-auto-export

RoadReach Auto Export is the public, independently deployable showroom. Vehicle data is loaded from the standard RoadReach HTTPS/JSON API instead of being stored in this repository.

## Deployment configuration

Set the GitHub Actions repository variable `PUBLIC_API_URL` to the RoadReach public API origin, for example:

```text
https://roadreach.pages.dev
```

The deployment workflow writes `config.js` from that variable. The showroom then uses the standard vehicle-list and inquiry endpoints under `/api/public/`. No API keys or internal RoadReach data belong in this repository.

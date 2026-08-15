# RoadReach Auto Export

Independent public B2B vehicle showroom plus a mobile-capable admin/CRM MVP.

- Public frontend: GitHub Pages
- Database, Auth and Storage: Supabase Free Tier
- Admin: `/admin/`
- Gmail import: server-side Gmail API OAuth with `gmail.readonly`

Start with [the deployment guide](docs/DEPLOYMENT.md), [security boundary](docs/SECURITY.md), and [implementation report](docs/IMPLEMENTATION_REPORT.md).

Run local source and unit checks:

```text
npm run check
```

No secret/service-role key, administrator password, Gmail OAuth credential, full public VIN, internal RMB cost or customer export belongs in this repository.

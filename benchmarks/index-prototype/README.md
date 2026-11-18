# Index prototype

Measurements behind [docs/design/local-search-index.md](../../docs/design/local-search-index.md).
Not part of the server.

```sh
npm run benchmark                                  # records upstream data and dev results
npm install --no-save npm-high-impact@1.13.0
node benchmarks/index-prototype/run.mjs            # about 5 minutes: fetch 17K manifests, then measure
```

The corpus is held in memory and never written to disk.

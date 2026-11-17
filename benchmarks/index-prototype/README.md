# Index prototype

Measurements behind [docs/design/local-search-index.md](../../docs/design/local-search-index.md).
Not part of the server.

```sh
npm run benchmark                                   # records upstream data and dev results
npm install --no-save npm-high-impact@1.13.0
node benchmarks/index-prototype/fetch-corpus.mjs   # about 5 minutes, 17K /latest manifests
node benchmarks/index-prototype/evaluate.mjs        # size, latency, and retrieval on the dev split
```

# Reservoir Performance Benchmark

| Case | Cells | Fixture | Parse | Extract | VTK dataset | Property update | Picking | Estimated peak |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| small | 10,000 | 2.2 ms | 5.0 ms | 26.3 ms | 3.1 ms | 1.0 ms | 0.0 ms | 6.5 MiB |
| medium | 99,856 | 6.5 ms | 14.6 ms | 180.8 ms | 0.8 ms | 3.7 ms | 0.0 ms | 64.4 MiB |

## Top Bottlenecks

1. medium geometryExtraction: 180.8 ms
2. small geometryExtraction: 26.3 ms
3. medium parsing: 14.6 ms

## Measurement Notes

- First render is reported separately as not measured in this Node harness; it does not claim a GPU result.
- Worker transfer reports prepared transferable bytes, not cross-thread latency.
- Native/WASM work is not recommended by this framework unless repeated reports show a dominant CPU stage exceeding the generous regression threshold.

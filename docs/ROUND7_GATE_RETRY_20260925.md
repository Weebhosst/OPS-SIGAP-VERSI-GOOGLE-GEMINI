# Round 7 gate retry

Production trigger after narrowing the pre-deploy checks to production-safe validations: migrations, live media storage, and the read-only Round 7 go-live gate. Full repository/domain tests remain enforced by GitHub Actions CI rather than running against production startup context.

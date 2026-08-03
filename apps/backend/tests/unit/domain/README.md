# apps/backend/tests/unit/domain/

Unit tests for domain models and domain services. No mocking needed — these are pure Python.

Key scenarios:
- `path_validator.py`: path within workspace root succeeds
- `path_validator.py`: `../../../etc/passwd` raises `SecurityError`
- `path_validator.py`: symlink pointing outside workspace raises `SecurityError`
- `token_counter.py`: count is accurate for each model family tokenizer
- `message_compressor.py`: compressed history is shorter than original, preserves head and tail
- `memory_classifier.py`: sample facts classify into correct memory type


# Register accounting blueprint if available
try:
    import accounting.autoregister  # registers blueprint automatically
except Exception:
    pass

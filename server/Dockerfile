FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Train the price model at build time so the image is self-contained.
RUN python train_model.py

RUN useradd -m cropcare && chown -R cropcare /app
USER cropcare

EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=4s CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:5000/api/v1/health')"

CMD ["gunicorn", "-w", "2", "-b", "0.0.0.0:5000", "--timeout", "120", "app:app"]

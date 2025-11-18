# Используем официальный образ Python 3.12-slim
FROM python:3.12-slim

# Установка переменных окружения
ENV PYTHONUNBUFFERED 1
ENV APP_HOME /usr/src/app
# Настраиваем переменные для Poetry
ENV POETRY_HOME="/opt/poetry"
ENV PATH="$POETRY_HOME/bin:$PATH"

# Установка Poetry
# Устанавливаем Poetry с помощью pip
RUN pip install poetry

# Создание рабочей директории
WORKDIR $APP_HOME

# Копирование и установка зависимостей (используя Poetry)
# Копируем только файлы конфигурации для эффективного кэширования
COPY pyproject.toml poetry.lock ./

# Установка зависимостей с помощью Poetry
# --no-root устанавливает только зависимости, но не само приложение
RUN poetry install --no-root

# Копирование всего остального кода приложения
COPY . .

# Приложение будет работать на порту 8000
EXPOSE 8000

# Команда для запуска Uvicorn
# Используем команду без --reload, так как это продакшн-контейнер
CMD ["poetry", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
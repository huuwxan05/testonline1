FROM php:8.3-apache

RUN docker-php-ext-install pdo_pgsql \
    && a2enmod rewrite headers

COPY deploy/apache.conf /etc/apache2/sites-available/000-default.conf
COPY . /var/www/html/

RUN mkdir -p /var/www/html/logs \
    && chown -R www-data:www-data /var/www/html/logs

EXPOSE 80

CMD ["apache2-foreground"]

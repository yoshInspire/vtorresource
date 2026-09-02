# Развёртывание и эксплуатация

Продакшен-сервер приложения «Вторресурс» / mbaza55.ru.

> В этом файле нет паролей и ключей. Доступы лежат вне репозитория —
> см. раздел [Доступы](#доступы).

---

## Инфраструктура

| Параметр      | Значение                                  |
|---------------|-------------------------------------------|
| Сервер        | `77.91.112.185`, KVM VPS                  |
| ОС            | Ubuntu 24.04.4 LTS                        |
| Ресурсы       | 2 vCPU, 1.8 ГБ RAM, 58 ГБ диск, 2 ГБ swap |
| Домен         | `mbaza55.ru` (+ `www` → редирект на без-www) |
| Таймзона      | Europe/Moscow                             |

### Установленное ПО

| Компонент | Версия  | Роль                                   |
|-----------|---------|----------------------------------------|
| Node.js   | 22.x LTS | среда выполнения приложения            |
| nginx     | 1.24    | обратный прокси, TLS, статика          |
| certbot   | 2.9     | сертификаты Let's Encrypt, автопродление |
| ufw       | 0.36    | файрвол: открыты только 22, 80, 443    |
| fail2ban  | —       | бан перебора SSH (4 попытки → 24 ч)    |
| unattended-upgrades | — | автоматические обновления безопасности |

### Размещение

```
/srv/mbaza55/                       код приложения (git clone), владелец mbaza:mbaza
/srv/mbaza55/.env                   продакшен-конфиг, вне git, права 640
/srv/mbaza55/data/prices.json       прайс
/srv/mbaza55/data/leads.json        заявки с форм (персональные данные, вне git)
/etc/systemd/system/mbaza55.service юнит systemd
/etc/nginx/sites-available/mbaza55  конфиг nginx
/usr/local/bin/mbaza55-deploy       обновление из GitHub
/usr/local/bin/mbaza55-tls          выпуск TLS-сертификата
/usr/local/bin/mbaza55-tls-await    автовыпуск: ждёт распространения DNS
/etc/mbaza55-tls.env                e-mail для Let's Encrypt, вне git, права 600
```

Приложение работает от системного пользователя `mbaza` (без shell), слушает
`127.0.0.1:3000` — наружу порт не выставлен, весь трафик идёт через nginx.
Юнит ограничен: `ProtectSystem=strict`, запись разрешена только в
`/srv/mbaza55/data`, лимит памяти 512 МБ.

---

## Доступы

Вход на сервер — **только по SSH-ключу**, парольная аутентификация отключена
(`/etc/ssh/sshd_config.d/00-hardening.conf`). Пароль root сохранён, но пригоден
только для консоли хостера (VNC/KVM).

Приватный ключ, пароль root и инвентарь лежат локально, вне репозитория:

```
<корень проекта>/server-access/mbaza55/
    ssh/id_ed25519_mbaza55        приватный ключ
    ssh/id_ed25519_mbaza55.pub    публичный ключ
    root-password.txt             пароль root (для консоли хостера)
    README.md                     полный инвентарь доступов
```

Каталог `server-access/` внесён в `.gitignore` — в репозиторий он не попадает.
**Сделайте резервную копию этого каталога:** без приватного ключа вход на сервер
возможен только через консоль хостера.

В `~/.ssh/config` добавлен алиас:

```bash
ssh mbaza55
```

---

## Обновление сайта

Изменения выкатываются из ветки `main` на GitHub:

```bash
ssh mbaza55 mbaza55-deploy
```

Скрипт делает `git fetch` + `git reset --hard origin/main`, ставит
production-зависимости, перезапускает сервис и проверяет, что сайт отвечает 200.
При неудаче печатает последние 30 строк журнала и возвращает ненулевой код.

⚠️ `git reset --hard` затирает локальные правки на сервере. Правьте код только
через репозиторий. Файлы `data/leads.json` и `.env` не отслеживаются git и при
деплое сохраняются.

---

## HTTPS

DNS настроен у регистратора (reg.ru, зона на `ns1/ns2.reg.ru`):

```
mbaza55.ru.       A   77.91.112.185
www.mbaza55.ru.   A   77.91.112.185
```

Домен зарегистрирован 2026-09-02, статус в реестре `REGISTERED, DELEGATED,
VERIFIED`. Авторитативные серверы отдают правильный адрес, публичным резолверам
нужно время на распространение.

**Выпуск сертификата автоматизирован.** На сервере работает таймер
`mbaza55-tls-await.timer`: раз в 10 минут он проверяет, начал ли домен указывать
на этот сервер, и как только это произойдёт — выпускает сертификат Let's Encrypt
на оба имени, включает редирект с HTTP на HTTPS, перезагружает nginx и отключает
сам себя. Вмешательства не требуется.

```bash
# следующая проверка и журнал автовыпуска
ssh mbaza55 "systemctl list-timers mbaza55-tls-await.timer --no-pager"
ssh mbaza55 "journalctl -u mbaza55-tls-await -n 30 --no-pager"

# состояние сертификата
ssh mbaza55 "certbot certificates"
```

E-mail для уведомлений Let's Encrypt лежит в `/etc/mbaza55-tls.env` (права 600,
вне репозитория). Ручной запуск, если понадобится:

```bash
ssh mbaza55 "set -a; . /etc/mbaza55-tls.env; set +a; mbaza55-tls"
```

Скрипт `mbaza55-tls` откажется работать, пока домен не указывает на сервер, —
так исключены неудачные обращения к Let's Encrypt и упор в их лимиты.
Автопродление сертификата обеспечивает штатный `certbot.timer`.

После выпуска сертификата ничего менять в приложении не нужно: `SITE_URL` в
`.env` уже задан как `https://mbaza55.ru`, поэтому canonical, Open Graph,
`sitemap.xml` и JSON-LD сразу отдают правильные адреса.

---

## Эксплуатация

```bash
# статус и журнал приложения
ssh mbaza55 "systemctl status mbaza55"
ssh mbaza55 "journalctl -u mbaza55 -n 100 --no-pager"
ssh mbaza55 "journalctl -u mbaza55 -f"          # хвост в реальном времени

# перезапуск
ssh mbaza55 "systemctl restart mbaza55"

# логи nginx
ssh mbaza55 "tail -f /var/log/nginx/mbaza55.access.log"
ssh mbaza55 "tail -f /var/log/nginx/mbaza55.error.log"

# заявки с форм
ssh mbaza55 "cat /srv/mbaza55/data/leads.json"

# забрать заявки к себе
scp mbaza55:/srv/mbaza55/data/leads.json ./leads-$(date +%F).json

# состояние защиты
ssh mbaza55 "ufw status verbose; fail2ban-client status sshd"
```

### Правка цен до появления админки

Прайс — это `data/prices.json`. Правильный путь: изменить файл в репозитории,
запушить в `main` и выкатить через `mbaza55-deploy`. Тогда правка сохранится
в истории и не потеряется при следующем деплое.

Если нужно поправить цену срочно прямо на сервере — помните, что `mbaza55-deploy`
затрёт изменение:

```bash
ssh mbaza55
nano /srv/mbaza55/data/prices.json
systemctl restart mbaza55
```

---

## Резервное копирование

Постоянно меняются только два файла:

- `/srv/mbaza55/data/leads.json` — заявки клиентов (персональные данные);
- `/srv/mbaza55/data/prices.json` — прайс, если его правили на сервере.

Остальное восстанавливается из GitHub. Простой бэкап заявок раз в сутки:

```bash
ssh mbaza55 'mkdir -p /root/backups && (crontab -l 2>/dev/null; echo "15 3 * * * cp /srv/mbaza55/data/leads.json /root/backups/leads-\$(date +\%F).json && find /root/backups -name \"leads-*\" -mtime +30 -delete") | crontab -'
```

---

## Что осталось сделать

| Задача | Статус |
|--------|--------|
| A-записи `mbaza55.ru` и `www` на `77.91.112.185` | ✅ настроены у регистратора |
| Выпуск TLS-сертификата | автоматически, ждёт распространения DNS |
| E-mail для Let's Encrypt | ✅ `/etc/mbaza55-tls.env` |
| Заменить заглушки в `src/config/site.js` (юрлицо, e-mail, индекс, координаты) | ждёт вас |
| Логотип с визитки вместо нарисованной замены | ждёт вас |
| Админка управления ценами (`/admin`) | следующий этап |
| Резервная копия каталога `server-access/` | ждёт вас |

<?php
$CONFIG = [
    'filelocking.enabled' => true,
    'memcache.locking' => '\\OC\\Memcache\\Redis',
    'redis' => [
        'host' => 'redis',
        'port' => 6379,
        'password' => getenv('LAB_REDIS_PASSWORD'),
        'timeout' => 1.5,
        'read_timeout' => 1.5,
    ],
];

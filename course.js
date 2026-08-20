const nginxLessons = [
  {
    id: 'request-lifecycle', no: '01', module: '模块一 · 请求匹配', duration: '35 MIN',
    title: '一次请求如何穿过 Nginx', summary: '建立 client → listen → server → location → content handler → response 的完整链路。',
    objectives: ['能画出一次请求的处理链路', '知道配置解析与请求处理不是一回事', '用 curl 区分 DNS、连接、TLS 与应用阶段'],
    theory: [
      { title: '先连接，再匹配', body: '浏览器先通过 DNS 找到地址并建立 TCP/TLS 连接。Nginx 接受连接后，才根据监听端口、Host 和 URI 选择配置。502 通常已经到达 Nginx，而连接拒绝往往发生在更早阶段。' },
      { title: '请求处理阶段', body: '请求会依次经历重写、访问控制、内容生成与日志记录。location 决定使用哪组配置，但真正响应内容的可能是静态文件模块、proxy、fastcgi 或 return。' }
    ],
    code: `curl -sv https://demo.local/api/users -o /dev/null\n# 观察：DNS → connect → TLS → request → response\n\nlog_format trace '$request_id $host $uri $status $request_time';\naccess_log /var/log/nginx/trace.log trace;`,
    lab: { goal: '为请求增加可追踪 ID，并在响应头与日志中同时看到它。', steps: ['在 server 中设置 add_header X-Request-ID $request_id always', '定义包含 $request_id 的 log_format', '执行两次 curl -I，比较 ID 是否不同', '在 access log 中找到对应请求'], expected: '响应头和日志出现相同 request_id；每次请求的 ID 不同。' },
    pitfalls: ['把浏览器 502 当成 DNS 故障', '只看 error.log，不关联 access.log 的请求时间和状态码'],
    quiz: { question: '收到 Nginx 返回的 404，最能说明什么？', options: ['DNS 一定正常且请求已到达某个 HTTP 处理器', '上游应用一定启动', 'TLS 一定没有配置'], answer: 0, explanation: 'HTTP 404 表明请求已经进入 HTTP 层并由某个处理器返回；它不能证明上游一定启动。' },
    acceptance: ['能用自己的话解释请求六个阶段', '能用 request_id 关联响应和日志']
  },
  {
    id: 'server-selection', no: '02', module: '模块一 · 请求匹配', duration: '40 MIN',
    title: 'listen 与 server_name 如何选站点', summary: '理解端口、地址、SNI 与 Host 的选择顺序，避免请求掉进默认站点。',
    objectives: ['区分 listen 与 server_name', '理解 default_server 的作用', '能诊断域名命中错误站点'],
    theory: [
      { title: '两阶段选择', body: 'Nginx 先按目标 IP 和端口选择 listen 集合，再使用请求 Host 匹配 server_name。没有匹配时落入该端口的 default_server，而不是随机选择。' },
      { title: 'HTTPS 的额外约束', body: 'TLS 握手早于 HTTP Host。客户端通过 SNI 告诉服务器目标域名，因此证书选择和 HTTP server 选择既相关又不是同一步。' }
    ],
    code: `server {\n  listen 80 default_server;\n  server_name _;\n  return 444;\n}\n\nserver {\n  listen 80;\n  server_name api.demo.local;\n  return 200 "api server\\n";\n}`,
    lab: { goal: '用同一个 IP 模拟三个 Host，确认默认站点行为。', steps: ['写一个 default_server 和一个 api.demo.local server', '执行 curl -H "Host: api.demo.local" http://127.0.0.1', '改用未知 Host 再请求', '运行 nginx -T 确认最终加载配置'], expected: '已知 Host 返回 200；未知 Host 被默认站点关闭或返回明确错误。' },
    pitfalls: ['把 server_name 当成 DNS 配置', '多个文件重复声明 default_server', '只修改配置却忘记 reload'],
    quiz: { question: 'Host 没有匹配任何 server_name 时会怎样？', options: ['使用该 listen 集合的默认 server', '自动访问第一个上游', '直接由操作系统返回 404'], answer: 0, explanation: 'Nginx 会选择该地址与端口上的 default_server；未显式声明时通常是配置顺序中的第一个。' },
    acceptance: ['能配置拒绝未知 Host 的默认站点', '能用 curl -H Host 复现实验']
  },
  {
    id: 'location-priority', no: '03', module: '模块一 · 请求匹配', duration: '50 MIN',
    title: 'location 匹配优先级', summary: '用精确、前缀、正则与 ^~ 建立可预测的路由规则。',
    objectives: ['掌握 location 选择顺序', '知道最长前缀不总是最终结果', '能避免正则覆盖静态目录'],
    theory: [
      { title: '选择算法', body: '先检查 = 精确匹配；再记录最长前缀；若最长前缀带 ^~ 就停止，否则按配置顺序测试正则；第一个命中的正则获胜；没有正则命中才使用最长前缀。' },
      { title: '配置意图要显式', body: '登录回调等唯一 URI 适合精确匹配；资源目录常用 ^~；扩展名规则才使用正则。规则越清晰，排障时需要模拟的分支越少。' }
    ],
    code: `location = /health { return 200 "ok"; }\nlocation ^~ /assets/ { root /srv/site; }\nlocation /api/ { proxy_pass http://api; }\nlocation ~* \\.(png|jpg|css|js)$ { expires 7d; }`,
    lab: { goal: '为 6 个 URI 写出预期命中规则，并用响应头验证。', steps: ['给每个 location 添加 X-Matched-Location 响应头', '测试 /health、/assets/app.js、/api/users、/logo.png', '删除 ^~ 后重测 /assets/app.js', '记录规则变化原因'], expected: '带 ^~ 时 assets 前缀胜出；删除后扩展名正则可能覆盖它。' },
    pitfalls: ['认为正则按长度排序', '在多个正则中依赖“更具体”而忽略书写顺序'],
    quiz: { question: '最长前缀 location 带 ^~ 后，下一步是什么？', options: ['停止正则检查并使用该前缀', '继续寻找最长正则', '只检查精确匹配'], answer: 0, explanation: '^~ 的目的就是在选中该最长前缀后跳过正则匹配。' },
    acceptance: ['能手算至少 6 个 URI 的匹配结果', '能使用响应头证明实际命中规则']
  },
  {
    id: 'files-and-spa', no: '04', module: '模块一 · 请求匹配', duration: '55 MIN',
    title: 'root、alias 与 try_files', summary: '正确映射文件路径，并为 SPA 设置不会吞掉静态资源错误的回退。',
    objectives: ['区分 root 拼接与 alias 替换', '理解 try_files 的文件检查顺序', '配置可靠的 SPA fallback'],
    theory: [
      { title: '路径如何落盘', body: 'root 会把完整 URI 拼到目录后；alias 会用指定目录替换匹配到的 location 前缀。alias 尤其要注意 location 与目录末尾斜杠的一致性。' },
      { title: '回退不是万能 200', body: 'SPA 通常对页面路由回退 index.html，但 /assets 下缺失的 JS 应返回 404。若所有请求都回退 HTML，浏览器可能把 HTML 当 JS，最终出现 MIME type 错误。' }
    ],
    code: `root /srv/app/dist;\n\nlocation /assets/ {\n  try_files $uri =404;\n}\n\nlocation /downloads/ {\n  alias /srv/files/;\n}\n\nlocation / {\n  try_files $uri $uri/ /index.html;\n}`,
    lab: { goal: '部署一个带 /dashboard 路由的 SPA，并确保缺失 JS 返回 404。', steps: ['把 dist 放入 /srv/app/dist', '为 /assets/ 单独配置 try_files $uri =404', '页面路由使用 /index.html 回退', '分别请求 /dashboard 与 /assets/missing.js'], expected: '/dashboard 返回 index.html；missing.js 返回 404 和正确 Content-Type，而不是 HTML。' },
    pitfalls: ['alias 与 location 末尾斜杠不一致', '把 $uri/ 放进不需要目录索引的资源规则', '所有 404 都回退 index.html'],
    quiz: { question: 'location /img/ 使用 root /data 时，请求 /img/a.png 会读哪里？', options: ['/data/img/a.png', '/data/a.png', '/img/data/a.png'], answer: 0, explanation: 'root 会把完整 URI /img/a.png 拼到 /data 后。alias 才会替换匹配前缀。' },
    acceptance: ['能解释 root 与 alias 的落盘路径', 'SPA 页面刷新成功且缺失资源保持 404']
  },
  {
    id: 'proxy-pass-uri', no: '05', module: '模块二 · 反向代理', duration: '50 MIN',
    title: 'proxy_pass 的 URI 重写规则', summary: '彻底理解 proxy_pass 末尾斜杠，避免上游路径多一段或少一段。',
    objectives: ['预测两种 proxy_pass 的上游 URI', '区分 location 前缀替换和原 URI 保留', '用 echo 服务验证路径'],
    theory: [
      { title: '有没有 URI 部分', body: 'proxy_pass http://api; 不包含 URI，会保留规范化后的原请求 URI。proxy_pass http://api/; 包含 / 这个 URI，会用它替换匹配到的 location 前缀。末尾一个斜杠就可能改变接口地址。' },
      { title: '先写契约再配置', body: '先明确外部路径和上游路径的映射表，再决定是否剥离前缀。不要通过反复改斜杠碰运气；用上游日志或 echo 服务观察实际 URI。' }
    ],
    code: `# /api/users → 上游 /api/users\nlocation /api/ { proxy_pass http://api; }\n\n# /api/users → 上游 /users\nlocation /api/ { proxy_pass http://api/; }`,
    lab: { goal: '验证四组外部 URI 在有无尾斜杠时的上游路径。', steps: ['启动一个返回 request path 的本地 echo 服务', '分别配置 proxy_pass http://echo 与 http://echo/', '请求 /api/users 和 /api/', '把结果整理成映射表'], expected: '能够准确展示保留 /api/ 与剥离 /api/ 的差异。' },
    pitfalls: ['同时使用 rewrite 和 proxy_pass URI，导致二次改写', '只看浏览器地址，不看上游收到的路径'],
    quiz: { question: 'location /api/ 配合 proxy_pass http://app/，/api/users 到上游是什么？', options: ['/users', '/api/users', '//users'], answer: 0, explanation: 'proxy_pass 包含 URI /，它替换匹配到的 /api/ 前缀。' },
    acceptance: ['能不运行配置就预测上游 URI', '用 echo 服务保存验证截图或输出']
  },
  {
    id: 'forwarded-headers', no: '06', module: '模块二 · 反向代理', duration: '40 MIN',
    title: '正确传递 Host、协议与真实 IP', summary: '让上游生成正确链接、记录真实客户端，并避免盲目信任伪造头。',
    objectives: ['配置常用 forwarded headers', '理解 $remote_addr 与 X-Forwarded-For', '划定可信代理边界'],
    theory: [
      { title: '上游需要哪些上下文', body: 'Host 决定虚拟主机和绝对链接，X-Forwarded-Proto 告诉应用外部是否为 HTTPS，X-Forwarded-For 记录代理链。缺失这些信息会造成重定向到 http、日志全是代理 IP 等问题。' },
      { title: '头部不是天然可信', body: '客户端可以伪造 X-Forwarded-For。只有当入口代理覆盖或按可信链追加该头时，上游才能使用它做审计；鉴权和限流更应明确可信代理列表。' }
    ],
    code: `proxy_set_header Host $host;\nproxy_set_header X-Real-IP $remote_addr;\nproxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\nproxy_set_header X-Forwarded-Proto $scheme;\nproxy_set_header X-Request-ID $request_id;`,
    lab: { goal: '让上游打印五个头，并验证外部 HTTPS 信息完整。', steps: ['在代理 location 添加五个 header', '从客户端伪造 X-Forwarded-For 请求', '观察 $proxy_add_x_forwarded_for 的结果', '确认应用生成的绝对 URL 使用 https'], expected: '上游拿到正确 Host、Proto、代理链和 request_id；伪造值不会覆盖真实入口地址。' },
    pitfalls: ['使用 $http_x_forwarded_for 原样覆盖', 'Host 写死导致多域名环境错误'],
    quiz: { question: '哪个变量适合在现有代理链后追加当前客户端地址？', options: ['$proxy_add_x_forwarded_for', '$host', '$request_uri'], answer: 0, explanation: '$proxy_add_x_forwarded_for 会在已有 X-Forwarded-For 后追加 $remote_addr。' },
    acceptance: ['上游能打印完整请求上下文', '能解释为何不能盲信客户端传入的 XFF']
  },
  {
    id: 'upstream-balance', no: '07', module: '模块二 · 反向代理', duration: '50 MIN',
    title: 'upstream、负载均衡与连接复用', summary: '配置多实例分流、被动健康检查和 keepalive，理解它们的边界。',
    objectives: ['理解轮询、least_conn 与 hash', '配置 upstream keepalive', '知道被动健康检查不是完整探活'],
    theory: [
      { title: '算法服务于流量特征', body: '默认轮询适合请求成本相近的服务；least_conn 更适合长请求；ip_hash 或 hash 可提供一定粘性，但会影响扩缩容时的分布。不要用粘性掩盖应用会话状态设计问题。' },
      { title: '复用上游连接', body: 'upstream keepalive 保存空闲连接；同时需要给代理使用 HTTP/1.1 并清空 Connection 头。它减少握手成本，但连接池过大也会占用上游资源。' }
    ],
    code: `upstream api_cluster {\n  least_conn;\n  server api-1:3000 max_fails=3 fail_timeout=10s;\n  server api-2:3000 max_fails=3 fail_timeout=10s;\n  keepalive 32;\n}\nlocation /api/ {\n  proxy_http_version 1.1;\n  proxy_set_header Connection "";\n  proxy_pass http://api_cluster;\n}`,
    lab: { goal: '启动两个带实例 ID 的服务，观察分流和故障摘除。', steps: ['启动 api-1 与 api-2，响应中返回实例名', '连续请求 20 次并统计分布', '停止一个实例后继续请求', '恢复实例并观察 fail_timeout 后行为'], expected: '正常时请求分布到两实例；故障后大部分请求由健康实例处理。' },
    pitfalls: ['认为开源 Nginx 被动检查等同主动健康检查', '配置 keepalive 却仍发送 Connection: close'],
    quiz: { question: '长连接请求明显不均时，优先考虑哪种算法？', options: ['least_conn', '随机修改 weight', '只使用 ip_hash'], answer: 0, explanation: 'least_conn 会把新请求交给当前活动连接较少的实例。' },
    acceptance: ['能展示双实例分流统计', '能解释 max_fails/fail_timeout 的被动语义']
  },
  {
    id: 'timeouts-retries', no: '08', module: '模块二 · 反向代理', duration: '45 MIN',
    title: '超时、重试与幂等边界', summary: '避免无限等待，也避免把一次写操作重放成两次。',
    objectives: ['区分 connect/send/read timeout', '理解 proxy_next_upstream 条件', '为幂等与非幂等请求设计不同策略'],
    theory: [
      { title: '三个超时回答三个问题', body: 'connect_timeout 限制建立上游连接；send_timeout 限制向上游发送数据的间隔；read_timeout 限制两次读取之间的等待。它们通常不是整个请求的绝对总时长。' },
      { title: '重试有业务成本', body: 'GET 等幂等请求通常可在连接错误或超时时切换上游；POST 已经被上游处理但响应丢失时重试，可能产生重复订单。必须结合幂等键、方法和错误类型。' }
    ],
    code: `proxy_connect_timeout 2s;\nproxy_send_timeout 10s;\nproxy_read_timeout 15s;\nproxy_next_upstream error timeout http_502 http_503;\nproxy_next_upstream_tries 2;\nproxy_next_upstream_timeout 4s;`,
    lab: { goal: '模拟连接失败、慢响应和 503，记录最终状态与耗时。', steps: ['让一个上游端口拒绝连接', '让另一个上游延迟 20 秒', '增加返回 503 的实例', '分别发送 GET 与带幂等键的 POST'], expected: '连接错误快速失败或切换；慢响应在 read timeout 后结束；重试次数受上限控制。' },
    pitfalls: ['把所有 timeout 配成同一个大数', '对非幂等 POST 无条件重试', '没有限制总重试次数'],
    quiz: { question: '上游已连接，但 20 秒没有返回任何数据，主要由哪个超时控制？', options: ['proxy_read_timeout', 'proxy_connect_timeout', 'client_body_timeout'], answer: 0, explanation: '连接已建立后等待上游数据的间隔由 proxy_read_timeout 控制。' },
    acceptance: ['能用故障注入证明三个超时差异', '写出写接口的幂等与重试策略']
  },
  {
    id: 'compression-browser-cache', no: '09', module: '模块三 · 性能与缓存', duration: '45 MIN',
    title: '压缩与浏览器缓存', summary: '为 HTML 与带哈希资源制定不同策略，并用响应头证明效果。',
    objectives: ['理解协商缓存与强缓存', '为哈希资源配置 immutable', '用 curl 验证 gzip 与 304'],
    theory: [
      { title: '缓存策略来自可变性', body: '文件名带内容哈希的 JS/CSS 可缓存一年并标记 immutable；HTML 是入口，应短缓存或 no-cache，让浏览器每次验证新版本。不要按扩展名盲目配置，而要看发布时 URL 是否随内容变化。' },
      { title: '压缩有适用范围', body: '文本资源压缩收益明显；图片、视频通常已经压缩。gzip_vary 让中间缓存区分压缩和未压缩版本，gzip_min_length 避免压缩小响应的额外成本。' }
    ],
    code: `gzip on;\ngzip_vary on;\ngzip_min_length 1024;\ngzip_types text/css application/javascript application/json;\n\nlocation /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }\nlocation = /index.html { expires -1; add_header Cache-Control "no-cache"; }`,
    lab: { goal: '对比首访、强缓存和协商缓存请求。', steps: ['用 curl --compressed -I 请求 JS', '检查 Content-Encoding 与 Vary', '带 If-None-Match 请求 HTML', '记录传输大小和状态码'], expected: '文本资源使用 gzip；哈希资源获得长缓存；未变化 HTML 可返回 304。' },
    pitfalls: ['给 index.html 设置一年缓存', '对 JPEG 重复 gzip', '忘记 Vary: Accept-Encoding'],
    quiz: { question: '为什么 index.html 通常不应 immutable 缓存一年？', options: ['它引用的新资源入口可能变化', 'HTML 无法缓存', '浏览器不支持 HTML 缓存'], answer: 0, explanation: '入口 HTML 会随发布更新资源哈希；长时间不可重新验证会让用户停留在旧版本。' },
    acceptance: ['能展示 gzip 前后大小差异', '能解释 HTML 与哈希资源的缓存差异']
  },
  {
    id: 'proxy-cache', no: '10', module: '模块三 · 性能与缓存', duration: '55 MIN',
    title: 'proxy_cache 与缓存键', summary: '缓存可复用响应，同时控制鉴权、Cookie、过期与陈旧内容风险。',
    objectives: ['配置缓存区和缓存键', '识别不可缓存响应', '通过 HIT/MISS/BYPASS 观察行为'],
    theory: [
      { title: '缓存键定义“同一个响应”', body: '默认键通常包含 scheme、代理主机和 URI。若响应随语言、租户或认证用户变化，这些维度必须进入键或直接绕过缓存，否则会发生跨用户数据泄漏。' },
      { title: '可观测后再优化', body: '给响应增加 $upstream_cache_status，区分 MISS、HIT、BYPASS、EXPIRED 与 STALE。先证明命中率和正确性，再调整 inactive、valid 和磁盘大小。' }
    ],
    code: `proxy_cache_path /var/cache/nginx keys_zone=api_cache:10m max_size=1g inactive=30m;\nmap $http_authorization $skip_cache { default 1; "" 0; }\nlocation /public-api/ {\n  proxy_cache api_cache;\n  proxy_cache_bypass $skip_cache;\n  proxy_no_cache $skip_cache $upstream_http_set_cookie;\n  proxy_cache_valid 200 1m;\n  add_header X-Cache $upstream_cache_status always;\n  proxy_pass http://api;\n}`,
    lab: { goal: '验证匿名 GET 命中缓存、带 Authorization 请求绕过。', steps: ['让上游返回时间戳', '匿名请求两次并观察 X-Cache', '带 Authorization 再请求', '让上游返回 Set-Cookie 并确认不缓存'], expected: '匿名第二次为 HIT 且时间戳不变；认证请求为 BYPASS；Set-Cookie 响应不进入缓存。' },
    pitfalls: ['缓存包含用户数据的响应', '缓存键遗漏 query 参数或租户', '没有缓存状态响应头'],
    quiz: { question: '认证接口最安全的默认策略是什么？', options: ['默认绕过缓存，证明可共享后再放开', '所有 200 都缓存', '只缩短到 1 秒即可'], answer: 0, explanation: '认证响应通常与用户相关，应先默认绕过，避免跨用户泄漏。' },
    acceptance: ['能演示 MISS → HIT 与授权 BYPASS', '能写出缓存键包含的业务维度']
  },
  {
    id: 'logs-troubleshooting', no: '11', module: '模块四 · 稳定与排障', duration: '60 MIN',
    title: '用日志和状态码定位 404、502、504', summary: '形成 browser → DNS/CDN → Nginx → upstream → dependency 的分层排障路径。',
    objectives: ['理解常见网关状态码', '设计结构化 access log', '按层验证而不是盲改配置'],
    theory: [
      { title: '状态码是证据，不是结论', body: 'Nginx 自己找不到文件可能是 404；无法连接上游、上游重置连接常见 502；连接成功但等待响应超时常见 504。error.log 的具体 errno 和 upstream 地址决定下一步。' },
      { title: '先缩小故障域', body: '先从本机直连上游，再从 Nginx 容器内访问上游，最后经过公开域名。每次只跨越一个边界，可以区分应用、容器网络、代理配置和外部 DNS/CDN。' }
    ],
    code: `log_format upstream_json escape=json '{"rid":"$request_id","status":$status,"uri":"$uri","rt":$request_time,"upstream":"$upstream_addr","ustatus":"$upstream_status","urt":"$upstream_response_time"}';\naccess_log /var/log/nginx/access.json upstream_json;\nerror_log /var/log/nginx/error.log warn;`,
    lab: { goal: '主动制造 404、502、504，并为每个故障写出证据链。', steps: ['请求不存在静态文件制造 404', '把 proxy_pass 指向未监听端口制造 502', '让上游延迟超过 read timeout 制造 504', '记录 curl、access log、error log 和直连上游结果'], expected: '三类错误都有可复现步骤、关键日志和唯一根因，而不是只记录状态码。' },
    pitfalls: ['看到 502 就重启 Nginx', '只在宿主机 curl，上游实际运行在不同网络命名空间', '日志没有 upstream 地址和耗时'],
    quiz: { question: 'Nginx 能连接上游，但等待数据超过 read timeout，常见返回什么？', options: ['504', '301', '401'], answer: 0, explanation: '网关等待上游响应超时通常返回 504 Gateway Timeout。' },
    acceptance: ['提交三种故障的排障记录', '日志能显示 request_id、upstream 和各阶段耗时']
  },
  {
    id: 'production-capstone', no: '12', module: '模块四 · 稳定与排障', duration: '90 MIN',
    title: '生产配置与零停机发布实战', summary: '综合静态站、API 代理、缓存、限流、日志和安全响应头，完成可验收配置。',
    objectives: ['组织可维护的配置文件', '使用 nginx -t 与 reload 安全部署', '建立发布和回滚检查表'],
    theory: [
      { title: '配置也需要工程化', body: '把全局、站点和可复用片段分离；将上游、日志格式和安全策略纳入版本控制。每次发布先 nginx -t，再 reload；旧 worker 会处理完已有连接，实现平滑切换。' },
      { title: '完成标准必须可验证', body: '“配置好了”不算证据。应验证首页、SPA 刷新、静态 404、API 路径、真实 IP、缓存头、超时、限流、日志和回滚。自动化 smoke test 能避免发布后才发现路径问题。' }
    ],
    code: `set -e\nnginx -t\nnginx -s reload\n\ncurl -fsS https://demo.local/ >/dev/null\ncurl -fsS https://demo.local/dashboard >/dev/null\ncurl -fsS https://demo.local/api/health | jq -e '.ok == true'\ncurl -sSI https://demo.local/assets/app.hash.js | grep -qi immutable`,
    lab: { goal: '交付一个静态前端 + 双实例 API 的生产化反向代理。', steps: ['配置默认站点、TLS 站点、SPA 与 assets 规则', '配置 upstream、头、超时和有限重试', '加入缓存、安全头、限流和结构化日志', '编写 smoke.sh 并执行 nginx -t + reload', '模拟一个实例故障并执行回滚'], expected: '所有 smoke test 通过；单实例故障时健康接口可用；回滚可以恢复上一份配置。' },
    pitfalls: ['直接覆盖线上配置且无备份', 'reload 前不执行 nginx -t', '只测首页，不测深层路由和 API'],
    quiz: { question: '零停机更新 Nginx 配置的正确起点是什么？', options: ['先 nginx -t，再 reload', '直接 kill -9 master', '删除日志后重启'], answer: 0, explanation: '先校验语法和引用文件，成功后 reload，让新 worker 接管新连接。' },
    acceptance: ['提交完整 nginx 配置与 smoke.sh', '完成故障切换和回滚演示', '写一页架构与排障说明']
  }
];

(() => {
  const storageKey = 'nginx-course-progress-v1';
  const completed = new Set(JSON.parse(localStorage.getItem(storageKey) || '[]'));
  const catalog = document.querySelector('#courseCatalog');
  const view = document.querySelector('#lessonView');
  const escapeHtml = (value = '') => value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);

  function persist() {
    localStorage.setItem(storageKey, JSON.stringify([...completed]));
    renderCatalog();
    renderCourseProgress();
  }

  function renderCourseProgress() {
    const count = completed.size;
    const percent = Math.round((count / nginxLessons.length) * 100);
    document.querySelector('#courseDone').textContent = `${count} / ${nginxLessons.length}`;
    document.querySelector('#courseProgress').style.width = `${percent}%`;
    document.querySelector('#progressText').textContent = `${percent}%`;
    document.querySelector('#progressBar').style.width = `${percent}%`;
  }

  function renderCatalog() {
    catalog.innerHTML = nginxLessons.map((lesson) => `
      <article class="course-card ${completed.has(lesson.id) ? 'is-complete' : ''}">
        <div class="course-card-meta"><span>${lesson.no}</span><small>${lesson.duration}</small></div>
        <p>${lesson.module}</p>
        <h3>${lesson.title}</h3>
        <div>${lesson.summary}</div>
        <ul>${lesson.objectives.slice(0, 2).map((item) => `<li>${item}</li>`).join('')}</ul>
        <a href="#lesson/${lesson.id}">${completed.has(lesson.id) ? '复习课程' : '开始学习'} <b>→</b></a>
      </article>`).join('');
  }

  function renderLesson(lesson) {
    const index = nginxLessons.indexOf(lesson);
    const previous = nginxLessons[index - 1];
    const next = nginxLessons[index + 1];
    view.innerHTML = `
      <div class="lesson-shell">
        <header class="lesson-header">
          <a href="#course">← 返回课程目录</a>
          <span>${lesson.module} / LESSON ${lesson.no}</span>
          <small>${lesson.duration}</small>
        </header>
        <main class="lesson-content">
          <div class="lesson-hero"><p>${lesson.module}</p><h1>${lesson.title}</h1><div>${lesson.summary}</div></div>
          <section class="lesson-block objectives"><span>LEARNING OBJECTIVES</span><h2>学完你应该能够</h2><ul>${lesson.objectives.map((item) => `<li>${item}</li>`).join('')}</ul></section>
          ${lesson.theory.map((section, sectionIndex) => `<section class="lesson-block"><span>0${sectionIndex + 1} / CONCEPT</span><h2>${section.title}</h2><p>${section.body}</p></section>`).join('')}
          <section class="lesson-block code-block"><span>CONFIG / COMMAND</span><h2>跟着证据写配置</h2><pre><code>${escapeHtml(lesson.code)}</code></pre><button data-copy>复制代码</button></section>
          <section class="lesson-block lab-block"><span>HANDS-ON LAB</span><h2>${lesson.lab.goal}</h2><ol>${lesson.lab.steps.map((step) => `<li>${step}</li>`).join('')}</ol><div class="expected"><b>预期结果</b><p>${lesson.lab.expected}</p></div></section>
          <section class="lesson-block split-block"><div><span>COMMON MISTAKES</span><h2>常见错误</h2><ul>${lesson.pitfalls.map((item) => `<li>${item}</li>`).join('')}</ul></div><div><span>DEFINITION OF DONE</span><h2>完成标准</h2><ul>${lesson.acceptance.map((item) => `<li>${item}</li>`).join('')}</ul></div></section>
          <section class="lesson-block quiz-block"><span>SELF CHECK</span><h2>${lesson.quiz.question}</h2><div class="lesson-options">${lesson.quiz.options.map((option, optionIndex) => `<button data-answer="${optionIndex}"><i>${String.fromCharCode(65 + optionIndex)}</i>${option}</button>`).join('')}</div><p data-feedback>选择一个答案，系统会解释原因。</p></section>
          <section class="lesson-finish"><div><span>LESSON ${lesson.no}</span><h2>${completed.has(lesson.id) ? '这一课已完成' : '完成实验后，记录你的证据'}</h2></div><button data-complete>${completed.has(lesson.id) ? '✓ 已完成，点击取消' : '标记本课完成'}</button></section>
          <nav class="lesson-pager">${previous ? `<a href="#lesson/${previous.id}">← ${previous.no} ${previous.title}</a>` : '<span></span>'}${next ? `<a href="#lesson/${next.id}">${next.no} ${next.title} →</a>` : '<a href="#course">返回课程目录 →</a>'}</nav>
        </main>
      </div>`;
    view.classList.add('is-open');
    view.setAttribute('aria-hidden', 'false');
    document.body.classList.add('lesson-open');
    view.scrollTop = 0;
    view.querySelector('[data-copy]').addEventListener('click', async (event) => {
      await navigator.clipboard.writeText(lesson.code);
      event.currentTarget.textContent = '已复制';
    });
    view.querySelectorAll('[data-answer]').forEach((button) => button.addEventListener('click', () => {
      const selected = Number(button.dataset.answer);
      view.querySelectorAll('[data-answer]').forEach((item) => item.classList.remove('correct', 'wrong'));
      button.classList.add(selected === lesson.quiz.answer ? 'correct' : 'wrong');
      view.querySelector('[data-feedback]').textContent = selected === lesson.quiz.answer ? `回答正确。${lesson.quiz.explanation}` : `还不对。${lesson.quiz.explanation}`;
    }));
    view.querySelector('[data-complete]').addEventListener('click', () => {
      completed.has(lesson.id) ? completed.delete(lesson.id) : completed.add(lesson.id);
      persist();
      renderLesson(lesson);
    });
  }

  function route() {
    const match = window.location.hash.match(/^#lesson\/(.+)$/);
    const lesson = match ? nginxLessons.find((item) => item.id === match[1]) : null;
    if (lesson) renderLesson(lesson);
    else {
      view.classList.remove('is-open');
      view.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('lesson-open');
    }
  }

  document.querySelector('#resetProgress').addEventListener('click', () => {
    completed.clear();
    localStorage.removeItem(storageKey);
    persist();
  });
  window.addEventListener('hashchange', route);
  renderCatalog();
  renderCourseProgress();
  route();
})();

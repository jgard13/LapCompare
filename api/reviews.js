const axios = require('axios');

// Caché en memoria para token de Mercado Libre (OAuth Client Credentials)
let mlToken = null;
let mlTokenExpiry = 0;

async function getMLToken() {
    if (mlToken && Date.now() < mlTokenExpiry) {
        return mlToken;
    }
    const clientId = process.env.ML_CLIENT_ID;
    const clientSecret = process.env.ML_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        console.warn('[ML OAuth] Faltan ML_CLIENT_ID o ML_CLIENT_SECRET en variables de entorno.');
        return null;
    }
    try {
        console.log('[ML OAuth] Solicitando nuevo access token...');
        const resp = await axios.post('https://api.mercadolibre.com/oauth/token', 
            new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: clientId,
                client_secret: clientSecret
            }), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );
        mlToken = resp.data.access_token;
        // Restamos 5 minutos para evitar expiración cercana
        mlTokenExpiry = Date.now() + (resp.data.expires_in - 300) * 1000;
        console.log('[ML OAuth] Token obtenido con éxito. Vence en:', new Date(mlTokenExpiry).toISOString());
        return mlToken;
    } catch (error) {
        console.error('[ML OAuth Error] Error al obtener token:', error.response?.data || error.message);
        return null;
    }
}

async function fetchReviews(link) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        'Referer': 'https://www.google.com.mx/'
    };

    let reviews = [];
    let status = 'ok';

    // ─────────────────────────────────────────────────────────────
    // MERCADO LIBRE
    // ─────────────────────────────────────────────────────────────
    if (link.includes('mercadolibre.com.mx')) {
        let itemId = null;
        const widMatch = link.match(/[?&]wid=(MLM[A-Z0-9]+)/);
        if (widMatch) {
            itemId = widMatch[1];
        } else {
            const artMatch = link.match(/\/MLM-?(\d+)/);
            if (artMatch) {
                itemId = 'MLM' + artMatch[1];
            } else {
                const pMatch = link.match(/\/p\/(MLM[A-Z0-9]+)/);
                if (pMatch) itemId = pMatch[1];
            }
        }

        if (itemId) {
            console.log(`[Reviews] ML item ID: ${itemId}`);
            try {
                const reqHeaders = { 'Accept': 'application/json' };
                const token = await getMLToken();
                if (token) {
                    reqHeaders['Authorization'] = `Bearer ${token}`;
                }
                const mlRes = await axios.get(
                    `https://api.mercadolibre.com/reviews/item/${itemId}`,
                    { headers: reqHeaders, timeout: 8000 }
                );
                (mlRes.data.reviews || []).slice(0, 6).forEach(rev => {
                    const text = rev.content || rev.title || '';
                    if (text.length > 5) reviews.push({
                        author: rev.reviewer_name || 'Usuario de Mercado Libre',
                        rating: Math.round(rev.rate || 5),
                        text: text.trim()
                    });
                });
                console.log(`[Reviews] ML API OK – ${reviews.length} reseñas`);
                status = 'ok';
            } catch (e) {
                console.log(`[Reviews] ML API falló (${e.response?.status ?? e.message})`);
                status = 'blocked';
            }
        } else {
            status = 'blocked';
        }

    // ─────────────────────────────────────────────────────────────
    // LIVERPOOL
    // ─────────────────────────────────────────────────────────────
    } else if (link.includes('liverpool.com.mx')) {
        try {
            const lvResp = await axios.get(link, { headers, timeout: 12000 });
            const lvHtml = lvResp.data;
            console.log(`[Reviews] Liverpool HTML: ${lvHtml.length} bytes`);

            // 1. Extraer turntokey desde el JSON de __NEXT_DATA__
            let turntoKey = null;
            const ndMatch = lvHtml.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
            if (ndMatch) {
                try {
                    const nd = JSON.parse(ndMatch[1]);
                    turntoKey = nd?.props?.pageProps?.data?.flags?.turntokey
                        || nd?.props?.pageProps?.flags?.turntokey
                        || nd?.props?.pageProps?.data?.turntokey;
                    if (!turntoKey) {
                        const ttMatch = ndMatch[1].match(/"turntokey"\s*:\s*"([^"]+)"/);
                        if (ttMatch) turntoKey = ttMatch[1];
                    }
                } catch (_) {}
            }

            // Si no lo encontramos en __NEXT_DATA__, buscar directamente en el HTML
            if (!turntoKey) {
                const ttHtmlMatch = lvHtml.match(/"turntokey"\s*:\s*"([^"]+)"/);
                if (ttHtmlMatch) turntoKey = ttHtmlMatch[1];
            }

            // Extraer productId: número largo al final de la URL de Liverpool
            const lvProductIdMatch = link.match(/\/(\d{8,})(?:[/?#]|$)/);
            const lvProductId = lvProductIdMatch ? lvProductIdMatch[1] : null;

            if (turntoKey && lvProductId) {
                console.log(`[Reviews] Liverpool TurnTo key: ${turntoKey} productId: ${lvProductId}`);
                const ttUrl = `https://static.www.turnto.com/sitedata/${turntoKey}/v4_3/${lvProductId}/d/es_LA/catitemreviewshtml`;
                try {
                    const ttResp = await axios.get(ttUrl, { timeout: 8000 });
                    const ttHtml = ttResp.data;

                    const regexBlock = /<div class="TTreview"([\s\S]*?)<div class="TTclear"><\/div>\s*<\/div>/g;
                    let match;
                    while ((match = regexBlock.exec(ttHtml)) !== null) {
                        const blockContent = match[1];

                        // 1. Extraer calificación (rating)
                        const ratingMatch = blockContent.match(/rating="(\d+)"/);
                        const rating = ratingMatch ? parseInt(ratingMatch[1]) : 5;

                        // 2. Extraer título
                        const titleMatch = blockContent.match(/<div class="TTreviewTitle"[^>]*>([\s\S]*?)<\/div>/);
                        const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : '';

                        // 3. Extraer cuerpo (body)
                        const bodyMatch = blockContent.match(/<div class="TTreviewBody"[^>]*>([\s\S]*?)<\/div>/);
                        const body = bodyMatch ? bodyMatch[1].replace(/<[^>]*>/g, '').trim() : '';

                        // 4. Extraer autor
                        const authorMatch = blockContent.match(/<span itemprop="name">([\s\S]*?)<\/span>/);
                        const author = authorMatch ? authorMatch[1].replace(/<[^>]*>/g, '').trim() : 'Comprador de Liverpool';

                        // Combinar título y cuerpo
                        let text = body;
                        if (title && title !== body) {
                            text = title + (body ? ': ' + body : '');
                        }

                        if (text.length > 2 || title.length > 2) {
                            reviews.push({
                                author,
                                rating,
                                text: text || title
                            });
                        }
                    }

                    console.log(`[Reviews] TurnTo HTML OK – ${reviews.length} reseñas encontradas`);
                    status = 'ok';
                } catch (ttErr) {
                    console.log(`[Reviews] TurnTo HTML falló (${ttErr.response?.status ?? ttErr.message})`);
                    status = 'blocked';
                }
            } else {
                console.log(`[Reviews] Liverpool – turntoKey: ${turntoKey}, productId: ${lvProductId}`);
                status = 'blocked';
            }

        } catch (lvErr) {
            console.log(`[Reviews] Liverpool error: ${lvErr.message}`);
            status = 'blocked';
        }

    // ─────────────────────────────────────────────────────────────
    // WALMART
    // ─────────────────────────────────────────────────────────────
    } else if (link.includes('walmart.com.mx')) {
        try {
            let wmHtml = '';
            const zenrowsKey = process.env.ZENROWS_API_KEY;
            if (zenrowsKey) {
                const proxyUrl = `https://api.zenrows.com/v1/?apikey=${zenrowsKey}&url=${encodeURIComponent(link)}&premium_proxy=true&js_render=true`;
                const wmResp = await axios.get(proxyUrl, { timeout: 30000 });
                wmHtml = wmResp.data;
            } else {
                console.log(`[Reviews] Walmart: Sin ZENROWS_API_KEY, intentando directo...`);
                const wmResp = await axios.get(link, { headers, timeout: 10000 });
                wmHtml = wmResp.data;
            }
            console.log(`[Reviews] Walmart HTML: ${wmHtml.length} bytes`);

            const nextDataMatch = wmHtml.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
            if (nextDataMatch) {
                try {
                    const state = JSON.parse(nextDataMatch[1]);
                    const rList = state?.props?.pageProps?.initialData?.reviews?.reviews
                        || state?.props?.pageProps?.data?.reviews?.reviews || [];
                    rList.slice(0, 5).forEach(r => {
                        const text = r.reviewText || r.text || '';
                        if (text.length > 5) reviews.push({
                            author: r.reviewerName || r.userNickname || 'Comprador de Walmart',
                            rating: Math.round(r.rating || r.overallRating || 5),
                            text: text.trim()
                        });
                    });
                } catch (_) {}
            }

            if (reviews.length === 0) {
                const txtMatches = wmHtml.match(/"reviewText"\s*:\s*"([^"]{15,})"/g);
                if (txtMatches) {
                    txtMatches.slice(0, 5).forEach(m => {
                        const text = m.replace(/"reviewText"\s*:\s*"/, '').replace(/"$/, '');
                        reviews.push({ author: 'Comprador de Walmart', rating: 5, text: text.trim() });
                    });
                }
            }

            console.log(`[Reviews] Walmart: ${reviews.length} reseñas encontradas`);
            status = reviews.length > 0 ? 'ok' : 'blocked';
        } catch (wmErr) {
            console.log(`[Reviews] Walmart error: ${wmErr.message}`);
            status = 'blocked';
        }

    // ─────────────────────────────────────────────────────────────
    // DD TECH
    // ─────────────────────────────────────────────────────────────
    } else if (link.includes('ddtech.mx')) {
        console.log('[Reviews] DDTech: sin sistema de reseñas – retornando vacío.');
        status = 'no_reviews_system';
    }

    // Limpieza final de HTML entities y límite
    reviews = reviews
        .filter(r => r.text && r.text.length > 5)
        .slice(0, 6)
        .map(r => ({
            ...r,
            text: r.text
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, '&')
                .replace(/&nbsp;/g, ' ')
                .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
                .replace(/\\n/g, ' ')
                .replace(/\\"/g, '"')
                .trim()
        }));

    return { reviews, status };
}

module.exports = { fetchReviews };

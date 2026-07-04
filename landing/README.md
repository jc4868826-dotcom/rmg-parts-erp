# RMG Parts Landing

Frontend Premium preparado para conectar con el ERP de RMG.

## Arquitectura

assets/
    img/
    icons/

css/
    style.css

js/
    app.js

    config/
        config.js

    data/
        mock-data.js

    services/
        api.js
        product.service.js
        category.service.js
        cart.service.js
        search.service.js
        order.service.js
        auth.service.js

    components/
        header.js
        hero.js
        searchbar.js
        category-card.js
        product-card.js
        cart.js
        footer.js

    core/
        render.js
        router.js

Modo actual:

USE_MOCK_DATA = true

Cuando el ERP esté listo solamente deberá cambiarse a false.


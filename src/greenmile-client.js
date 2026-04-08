'use strict';

const DEFAULT_CONFIG = {
  baseUrl: 'https://3coracoes.greenmile.com',
  module: 'LIVE',
  build: '1705315',
  version: '26.0130',
  defaultAccept: 'application/json, text/plain, */*',
};

function normalizeSetCookie(setCookie) {
  if (!setCookie) return '';
  return String(setCookie)
    .split(',')
    .map((item) => String(item).split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

function extractRows(data) {
  return Array.isArray(data) ? data : (data && (data.content || data.rows || data.items) || []);
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return null;
}

function buildSingleFilterCriteria(attr, value, matchMode, includeMatchMode) {
  const filter = {
    attr: String(attr),
    eq: String(value),
  };
  if (includeMatchMode !== false) {
    filter.matchMode = String(matchMode || 'EXACT').toUpperCase();
  }
  return {
    criteriaChain: [
      {
        and: [filter],
      },
    ],
  };
}

function routeSummaryFilters() {
  return [
    'id',
    'route.driverAssignments.*',
    'route.driverAssignments.driver.id',
    'route.driverAssignments.driver.name',
    'route.driverAssignments.driver.key',
    'primaryAssignments.equipment.id',
    'primaryAssignments.equipment.key',
    'route.baseLineDeparture',
    'route.plannedDistance',
    'route.baselineSize1',
    'route.actualDistance',
    'route.plannedSize1',
    'route.actualSize1',
    'route.key',
    'route.description',
    'route.origin.id',
    'route.origin.description',
    'route.destination.id',
    'route.destination.description',
    'route.baseLineArrival',
    'route.plannedDeparture',
    'route.plannedArrival',
    'route.projectedDeparture',
    'route.projectedArrival',
    'route.actualDeparture',
    'route.actualArrival',
    'route.baseLineComplete',
    'route.plannedComplete',
    'route.projectedComplete',
    'route.actualComplete',
    'route.actualDistanceDataQuality',
    'route.actualCompleteDataQuality',
    'route.actualDepartureDataQuality',
    'route.plannedStart',
    'route.actualCost',
    'route.actualStart',
    'route.plannedCost',
    'route.baseLineCost',
    'route.id',
    'route.date',
    'route.totalStops',
    'route.canceledStops',
    'route.redeliveredStops',
    'route.actualDepartures',
    'route.organization.description',
    'route.status',
    'routePercentage',
    'stopView',
    'route.undeliveredStops',
    'totalStopsInProgress',
  ];
}

function routeRestrictionsFilters() {
  return [
    '*',
    'organization.id',
    'organization.description',
    'origin.*',
    'destination.*',
    'driverAssignments.*',
    'driverAssignments.driver.*',
    'equipmentAssignments.equipment.*',
    'equipmentAssignments.equipment.id',
    'equipmentAssignments.equipment.key',
    'equipmentAssignments.principal',
    'equipmentAssignments.equipment.gpsProvider.id',
    'proactiveRouteOptConfig',
  ];
}

function orderRestrictionsFilters() {
  return [
    '*',
    'id',
    'number',
    'lineItems.sku.id',
    'lineItems.sku.description',
    'lineItems.plannedSize1',
    'lineItems.plannedSize2',
    'lineItems.plannedSize3',
    'lineItems.actualSize1',
    'lineItems.actualSize2',
    'lineItems.actualSize3',
    'lineItems.plannedPickupSize1',
    'lineItems.plannedPickupSize2',
    'lineItems.plannedPickupSize3',
    'lineItems.actualPickupSize1',
    'lineItems.actualPickupSize2',
    'lineItems.actualPickupSize3',
    'lineItems.damagedSize1',
    'lineItems.damagedSize2',
    'lineItems.damagedSize3',
    'lineItems.deliveryReasonCode.id',
    'lineItems.deliveryReasonCode.description',
    'lineItems.overReasonCode.id',
    'lineItems.overReasonCode.description',
    'lineItems.shortReasonCode.id',
    'lineItems.shortReasonCode.description',
    'lineItems.damagedReasonCode.id',
    'lineItems.damagedReasonCode.description',
    'lineItems.pickupReasonCode.id',
    'lineItems.pickupReasonCode.description',
    'lineItems.lineItemID',
    'invoiceValue',
    'totalValue',
    'orderValue',
    'lineItems.invoiceValue',
    'lineItems.totalValue',
  ];
}

function stopViewRestrictionsFilters() {
  return [
    '*',
    'stop.*',
    'location.*',
    'plannedLocation.*',
    'actualLocation.*',
    'route.id',
    'route.key',
    'deliveryReasonCode.*',
    'distributionCenter.*',
    'pendingReasons.*',
  ];
}

function normalizeStopsFromRoute(summaryRow, routeDetails) {
  const routeStops =
    (routeDetails && (routeDetails.stopView || routeDetails.stopViews)) ||
    (summaryRow && (summaryRow.stopView || summaryRow.stopViews)) ||
    [];

  return routeStops.map((item) => {
    if (item && item.stop) {
      const stop = Object.assign({}, item.stop);
      if (!stop.location && item.location) {
        stop.location = item.location;
      }
      if (!stop.locationKey && item.location && item.location.key) {
        stop.locationKey = item.location.key;
      }
      return stop;
    }

    return item;
  });
}

function buildStopContext(stop, detail) {
  const location = firstDefined(
    detail && detail.location,
    stop && stop.location,
    detail && detail.stop && detail.stop.location,
    stop && stop.customer,
    detail && detail.customer
  ) || {};

  const locationId = firstDefined(
    location.id,
    stop && stop.locationId,
    detail && detail.locationId
  );

  const locationKey = firstDefined(
    location.key,
    location.alternativeKey,
    stop && stop.locationKey,
    detail && detail.locationKey,
    stop && stop.key,
    detail && detail.stop && detail.stop.key
  );

  const locationName = firstDefined(
    location.description,
    location.name,
    stop && stop.description,
    detail && detail.description
  );

  return {
    location,
    locationId,
    locationKey,
    locationName,
    signatureTarget: firstDefined(
      locationKey,
      stop && stop.key,
      detail && detail.stop && detail.stop.key,
      stop && stop.id
    ),
  };
}

function buildHeaders(config, session) {
  const headers = {
    Accept: config.defaultAccept,
    'Greenmile-Module': config.module,
    'Greenmile-Build': config.build,
    'Greenmile-Version': config.version,
  };
  if (session.cookie) headers.Cookie = session.cookie;
  if (session.token) headers.Authorization = 'Bearer ' + session.token;
  return headers;
}

function createGreenmileLocalClient(options = {}) {
  const username = String(options.username || '').trim();
  const password = String(options.password || '').trim();
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('Fetch API não disponível neste runtime Node.');
  }

  const config = Object.assign({}, DEFAULT_CONFIG, options.config || {});
  const session = {
    cookie: '',
    token: '',
    expiresIn: 0,
    jsessionid: '',
    raw: null,
  };

  async function parseResponse(response) {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch (err) {
      return text;
    }
  }

  async function login() {
    if (!username || !password) {
      throw new Error('Defina GREENMILE_USERNAME e GREENMILE_PASSWORD para uso local.');
    }

    const payload = new URLSearchParams({
      j_username: username,
      j_password: password,
    });

    const response = await fetchImpl(config.baseUrl.replace(/\/$/, '') + '/login', {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/html, */*',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Greenmile-Module': config.module,
      },
      body: payload.toString(),
      redirect: 'manual',
    });

    const parsed = await parseResponse(response);
    if (response.status !== 200) {
      throw new Error('Erro no login Greenmile: ' + response.status + ' - ' + JSON.stringify(parsed));
    }

    session.cookie = normalizeSetCookie(response.headers.get('set-cookie'));
    session.token = parsed && parsed.analyticsToken ? parsed.analyticsToken.access_token || '' : '';
    session.expiresIn = parsed && parsed.analyticsToken ? Number(parsed.analyticsToken.expires_in || 180) : 180;
    session.jsessionid = parsed && parsed.jsessionid ? parsed.jsessionid : '';
    session.raw = parsed;
    return {
      cookie: session.cookie,
      token: session.token,
      expiresIn: session.expiresIn,
      jsessionid: session.jsessionid,
      raw: session.raw,
    };
  }

  async function request(pathname, optionsArg = {}) {
    if (!session.cookie && !session.token) {
      await login();
    }

    const url = config.baseUrl.replace(/\/$/, '') + pathname;
    const headers = Object.assign(
      {},
      buildHeaders(config, session),
      optionsArg.headers || {}
    );
    const response = await fetchImpl(url, {
      method: optionsArg.method || 'GET',
      headers,
      body: optionsArg.payload ? JSON.stringify(optionsArg.payload) : undefined,
      redirect: 'manual',
    });
    const parsed = await parseResponse(response);
    if (!response.ok) {
      throw new Error('Erro Greenmile [' + pathname + ']: ' + response.status + ' - ' + JSON.stringify(parsed));
    }
    return parsed;
  }

  async function routeViewSummary(routeKey, maxResults = 1) {
    const criteriaQuery = {
      filters: routeSummaryFilters(),
      firstResult: 0,
      maxResults,
    };
    const body = {
      sort: [{ attr: 'route.date', type: 'DESC' }],
      ...buildSingleFilterCriteria('route.key', routeKey, 'EXACT', true),
    };
    return request(
      '/RouteView/Summary?criteria=' + encodeURIComponent(JSON.stringify(criteriaQuery)),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
        },
        payload: body,
      }
    );
  }

  async function getRouteRestrictionsByRouteId(routeId) {
    const criteriaQuery = {
      filters: routeRestrictionsFilters(),
    };
    const body = {
      sort: [],
      ...buildSingleFilterCriteria('id', routeId, 'EXACT', false),
    };
    return request(
      '/Route/restrictions?criteria=' + encodeURIComponent(JSON.stringify(criteriaQuery)),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
        },
        payload: body,
      }
    );
  }

  async function getStopViewsByRouteIds(routeIds) {
    return Promise.all((routeIds || []).map((routeId) => {
      const criteriaQuery = {
        filters: stopViewRestrictionsFilters(),
        including: ['geofence'],
      };
      const body = {
        sort: [{ attr: 'stop.plannedSequenceNum', type: 'ASC' }],
        ...buildSingleFilterCriteria('route.id', routeId, 'EXACT', false),
      };
      return request(
        '/StopView/restrictions?criteria=' + encodeURIComponent(JSON.stringify(criteriaQuery)),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json;charset=UTF-8',
          },
          payload: body,
        }
      );
    }));
  }

  async function getOrdersByStopIds(stopIds) {
    return Promise.all((stopIds || []).map((stopId) => {
      const criteriaQuery = {
        filters: orderRestrictionsFilters(),
      };
      const body = {
        sort: [],
        ...buildSingleFilterCriteria('stop.id', stopId, 'EXACT', false),
      };
      return request(
        '/Order/restrictions?criteria=' + encodeURIComponent(JSON.stringify(criteriaQuery)),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json;charset=UTF-8',
          },
          payload: body,
        }
      );
    }));
  }

  async function getRouteStopSignature(routeId, stopId) {
    return request(
      '/Route/' + encodeURIComponent(String(routeId)) + '/Stop/' + encodeURIComponent(String(stopId)) + '/Signature',
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json;charset=utf-8',
        },
      }
    );
  }

  async function getRouteBundleByKey(routeKey, optionsArg = {}) {
    const summary = await routeViewSummary(routeKey, optionsArg.maxResults || 1);
    const summaryRow = extractRows(summary)[0];
    if (!summaryRow || !summaryRow.route || !summaryRow.route.id) {
      throw new Error('Rota não encontrada para a route.key informada.');
    }

    const routeId = summaryRow.route.id;
    const routeDetails = await getRouteRestrictionsByRouteId(routeId);
    let stops = [];
    try {
      const stopViewsResponses = await getStopViewsByRouteIds([routeId]);
      stops = extractRows(stopViewsResponses[0]).map((item) => (item && item.stop ? item.stop : item));
    } catch (err) {
      stops = [];
    }

    if (!stops.length) {
      stops = normalizeStopsFromRoute(summaryRow, routeDetails);
    }

    const enrichedStops = stops.map((stop) => ({
      stop,
      stopId: stop && stop.id ? stop.id : null,
      stopKey: stop && stop.key ? stop.key : null,
    }));

    enrichedStops.forEach((item) => {
      if (item.context) return;
      item.context = buildStopContext(item.stop, item.detail);
      item.location = item.context.location;
      item.locationId = item.context.locationId;
      item.locationKey = item.context.locationKey;
      item.locationName = item.context.locationName;
      item.signatureTarget = item.context.signatureTarget;
    });

    if (optionsArg.includeOrders !== false) {
      const validStopIds = enrichedStops.filter((item) => item.stopId).map((item) => item.stopId);
      const orderResponses = await getOrdersByStopIds(validStopIds);
      let orderIndex = 0;
      enrichedStops.forEach((item) => {
        if (!item.stopId) return;
        item.orders = orderResponses[orderIndex];
        orderIndex += 1;
      });
    }

    if (optionsArg.includeSignatures) {
      await Promise.all(enrichedStops.map(async (item) => {
        if (!item.stopId) return;
        try {
          item.signature = await getRouteStopSignature(routeId, item.signatureTarget || item.stopKey || item.stopId);
        } catch (err) {
          item.signatureError = err && err.message ? err.message : String(err);
        }
      }));
    }

    return {
      routeKey: summaryRow.route.key,
      routeId,
      summary,
      routeDetails,
      stops: enrichedStops,
    };
  }

  return {
    login,
    request,
    routeViewSummary,
    getRouteBundleByKey,
  };
}

module.exports = {
  createGreenmileLocalClient,
  extractRows,
};

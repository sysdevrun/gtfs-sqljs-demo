# Departure Board Logic Analysis

## Summary
With the updated worker API, the provided code's approach **CAN** now be implemented, but there are **critical logic bugs** that need to be fixed.

## ✅ API Compatibility (Now Works!)

| Feature | Provided Code | Worker API Support | Status |
|---------|---------------|-------------------|--------|
| `getActiveServiceIds(date)` | ✅ Used | ✅ Exposed | **Works** |
| `getStopTimes({ stopId, serviceIds })` | ✅ Used | ✅ Supported via ExtendedStopTimeFilters | **Works** |
| `getTrips({ tripId: array })` | ✅ Used | ✅ Accepts arrays | **Works** |
| `getRoutes({ routeId: array })` | ✅ Used | ✅ Accepts arrays | **Works** |
| `getStops({ stopId: array })` | ✅ Used | ✅ Accepts arrays | **Works** |

**Verdict**: All required API methods are now available! ✅

---

## ❌ Logic Issues Found

### 1. **CRITICAL BUG: Wrong Schedule Relationship Check**

**Provided Code (Line 60-62):**
```typescript
if (st.realtime?.schedule_relationship === 1) {
  return false; // Skip cancelled trips
}
```

**Problem:** According to gtfs-sqljs definitions:
```typescript
enum ScheduleRelationship {
    SCHEDULED = 0,
    ADDED = 1,        // ← Provided code checks this!
    UNSCHEDULED = 2,
    CANCELED = 3,     // ← Should check this instead
    SKIPPED = 4,      // ← And this
    NO_DATA = 5
}
```

**Impact**:
- ❌ **Filters out ADDED trips** (which are valid extra service)
- ❌ **Does NOT filter CANCELED trips** (which should be hidden)
- ❌ **Does NOT filter SKIPPED trips** (which should be hidden)

**Correct Logic:**
```typescript
if (st.realtime?.schedule_relationship === 3 ||
    st.realtime?.schedule_relationship === 4) {
  return false; // Skip CANCELED and SKIPPED trips
}
```

---

### 2. **Realtime Time Handling - Two Valid Approaches**

The gtfs-sqljs `StopTimeRealtime` interface provides:
```typescript
interface StopTimeRealtime {
    arrival_delay?: number;      // Seconds of delay (can be negative)
    arrival_time?: number;       // Absolute time in seconds since midnight
    departure_delay?: number;    // Seconds of delay (can be negative)
    departure_time?: number;     // Absolute time in seconds since midnight
    schedule_relationship?: ScheduleRelationship;
}
```

**Provided Code Approach (Relative):**
```typescript
let adjustedSeconds = departureSeconds;
if (st.realtime?.departure_delay) {
  adjustedSeconds += st.realtime.departure_delay;
}
```

**Current Code Approach (Absolute):**
```typescript
let realtimeDepartureSeconds: number | null = null;
if (stopTime.realtime?.departure_time) {
  realtimeDepartureSeconds = stopTime.realtime.departure_time;
}
const effectiveSeconds = realtimeDepartureSeconds ?? departureTimeSeconds;
```

**Analysis:**
- Both are valid
- **Absolute (`departure_time`)** is more direct and less error-prone
- **Relative (`departure_delay`)** requires adding to scheduled time
- The library provides both, so either works

**Current Implementation is Better** because it uses the absolute time directly.

---

### 3. **Missing parseGtfsTime Function**

**Provided Code (Line 14, 53):**
```typescript
const currentSeconds = parseGtfsTime(currentTime);
const departureSeconds = parseGtfsTime(st.departure_time);
```

**Problem:** This function doesn't exist in the codebase.

**Current Implementation (DeparturesTab.tsx:274-275):**
```typescript
const [h, m, s] = stopTime.departure_time.split(':').map(Number);
const departureTimeSeconds = h * 3600 + m * 60 + s;
```

**Solution:** Use inline parsing or create a helper function.

---

### 4. **Missing buildDepartureBoard Function**

**Provided Code (Line 77-83):**
```typescript
const boards = stopIds.map(stopId =>
  buildDepartureBoard(
    stopId,
    upcomingDepartures,
    tripMap,
    routeMap,
    stopMap,
    currentSeconds
  )
);
```

**Problem:** This function is not defined anywhere.

**Solution:** This needs to be implemented based on the desired return structure.

---

## 🎯 Key Advantages of Provided Approach

### 1. **Efficiency - Single Query vs Multiple Queries**

**Provided Code:**
```typescript
// ✅ ONE query to get all stop times at selected stops
const allStopTimes = gtfs.getStopTimes({
  stopId: stopIds,
  serviceIds: activeServiceIds,
  includeRealtime: true,
});
```

**Current Code (DeparturesTab.tsx:228-256):**
```typescript
// ❌ Query trips for EACH route, then stop times for EACH trip
for (const route of routes) {
  const trips = await workerApi.getTrips({ routeId: route.route_id, date: today })
  for (const [tripId, tripInfo] of tripsToday) {
    const stopTimes = await workerApi.getStopTimes({ tripId, includeRealtime: true })
    // ...
  }
}
```

**Impact:**
- Provided: **1 database query** (filtered at SQL level)
- Current: **N + M queries** (N routes + M trips)
- For a system with 20 routes and 200 trips = **221 queries vs 1 query**

**Performance Difference:** **~200x faster** for typical transit systems

---

### 2. **Cleaner Service Filtering**

**Provided Code:**
```typescript
const activeServiceIds = gtfs.getActiveServiceIds(agencyDate);
const allStopTimes = gtfs.getStopTimes({
  stopId: stopIds,
  serviceIds: activeServiceIds,
  includeRealtime: true,
});
```

**Current Code:**
```typescript
// Gets trips by date, which internally uses service IDs
// but loads ALL trips for each route, then filters
```

**Advantage:** More explicit and allows for custom service filtering if needed.

---

## 📋 Recommended Implementation

Based on this analysis, here's the corrected logic:

```typescript
async function getUpcomingDepartures(
  workerApi: GtfsWorkerAPI,
  stopIds: string[],
  agencyTimezone: string,
  windowMinutes: number = 120
) {
  // 1. Get current time in agency timezone
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: agencyTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(now);
  const agencyDate = `${parts.find(p => p.type === 'year')!.value}${parts.find(p => p.type === 'month')!.value}${parts.find(p => p.type === 'day')!.value}`;
  const currentTime = `${parts.find(p => p.type === 'hour')!.value}:${parts.find(p => p.type === 'minute')!.value}:${parts.find(p => p.type === 'second')!.value}`;

  // Parse time to seconds
  const [h, m, s] = currentTime.split(':').map(Number);
  const currentSeconds = h * 3600 + m * 60 + s;

  // 2. Get active service IDs
  const activeServiceIds = await workerApi.getActiveServiceIds(agencyDate);

  if (activeServiceIds.length === 0) {
    console.warn('No active services for date:', agencyDate);
    return [];
  }

  // 3. Query stop times - EFFICIENT: Single query!
  const allStopTimes = await workerApi.getStopTimes({
    stopId: stopIds,
    serviceIds: activeServiceIds,
    includeRealtime: true,
  });

  // 4. Filter for upcoming departures
  const windowSeconds = windowMinutes * 60;
  const upcomingDepartures = allStopTimes.filter(st => {
    // Parse scheduled departure time
    const [h, m, s] = st.departure_time.split(':').map(Number);
    const scheduledSeconds = h * 3600 + m * 60 + s;

    // Get effective departure time (realtime or scheduled)
    // Use absolute time (departure_time) if available, fallback to scheduled
    const effectiveSeconds = st.realtime?.departure_time ?? scheduledSeconds;

    // ✅ FIXED: Skip CANCELED and SKIPPED trips
    if (st.realtime?.schedule_relationship === 3 ||  // CANCELED
        st.realtime?.schedule_relationship === 4) {  // SKIPPED
      return false;
    }

    // Include if in time window
    return effectiveSeconds >= currentSeconds &&
           effectiveSeconds <= currentSeconds + windowSeconds;
  });

  // 5. Enrich with trip/route/stop data
  const tripIds = [...new Set(upcomingDepartures.map(st => st.trip_id))];
  const trips = await workerApi.getTrips({ tripId: tripIds, includeRealtime: true });
  const tripMap = new Map(trips.map(t => [t.trip_id, t]));

  const routeIds = [...new Set(trips.map(t => t.route_id))];
  const routes = await workerApi.getRoutes({ routeId: routeIds });
  const routeMap = new Map(routes.map(r => [r.route_id, r]));

  const stops = await workerApi.getStops({ stopId: stopIds });
  const stopMap = new Map(stops.map(s => [s.stop_id, s]));

  // 6. Return structured departures
  return upcomingDepartures.map(st => ({
    stopTime: st,
    stop: stopMap.get(st.stop_id)!,
    trip: tripMap.get(st.trip_id)!,
    route: routeMap.get(tripMap.get(st.trip_id)!.route_id)!,
    scheduledDepartureSeconds: (() => {
      const [h, m, s] = st.departure_time.split(':').map(Number);
      return h * 3600 + m * 60 + s;
    })(),
    effectiveDepartureSeconds: st.realtime?.departure_time ?? (() => {
      const [h, m, s] = st.departure_time.split(':').map(Number);
      return h * 3600 + m * 60 + s;
    })(),
    isRealtime: !!st.realtime,
    isCanceled: st.realtime?.schedule_relationship === 3,
    isSkipped: st.realtime?.schedule_relationship === 4,
    delay: st.realtime?.departure_delay
  })).sort((a, b) => a.effectiveDepartureSeconds - b.effectiveDepartureSeconds);
}
```

---

## 🔄 Comparison Table

| Aspect | Provided Code | Current Code | Recommended |
|--------|---------------|--------------|-------------|
| **API Support** | ✅ Now works | ✅ Works | Either |
| **Efficiency** | ✅ 1 query | ❌ N+M queries | **Provided approach** |
| **Schedule Relationship Check** | ❌ WRONG (checks ADDED=1) | ❌ Missing | **Use 3 & 4** |
| **Realtime Time** | ⚠️ Uses delay (relative) | ✅ Uses absolute time | **Current is better** |
| **Missing Functions** | ❌ parseGtfsTime, buildDepartureBoard | ✅ Has all | **Need to add** |
| **Service Filtering** | ✅ Explicit serviceIds | ⚠️ Via date param | **Provided is clearer** |

---

## ✅ Final Verdict

**Can the provided code logic work now?**
**YES**, with critical fixes:

1. ✅ **API Support**: All methods now available
2. ❌ **Fix Bug**: Change `schedule_relationship === 1` to `=== 3 || === 4`
3. ✅ **Use Absolute Time**: Prefer `departure_time` over `departure_delay`
4. ⚠️ **Add Missing Functions**: Implement `parseGtfsTime` and `buildDepartureBoard`
5. ✅ **Adopt Efficient Query Pattern**: Use single `getStopTimes()` call with filters

**Recommended Action:** Implement the corrected version shown above, which combines:
- The **efficiency** of the provided approach (single query)
- The **correctness** of using absolute realtime times
- **Proper filtering** of canceled/skipped trips

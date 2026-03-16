(function () {
  const path = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll("[data-nav]").forEach((link) => {
    if (link.getAttribute("href") === path) {
      link.classList.add("active");
    }
  });

  document.querySelectorAll(".topbar-row").forEach((row) => {
    const toggle = row.querySelector(".topbar-menu-toggle");
    if (!toggle) return;

    const setOpen = (open) => {
      row.classList.toggle("nav-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    };

    toggle.addEventListener("click", () => {
      setOpen(!row.classList.contains("nav-open"));
    });

    row.querySelectorAll(".nav-links a, .actions a").forEach((link) => {
      link.addEventListener("click", () => {
        if (window.innerWidth <= 980) {
          setOpen(false);
        }
      });
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 980) {
        setOpen(false);
      }
    });
  });

  const filter = document.getElementById("endpointFilter");
  const table = document.getElementById("apiTable");
  if (filter && table) {
    filter.addEventListener("input", (e) => {
      const q = String(e.target.value || "").trim().toLowerCase();
      table.querySelectorAll("tbody tr").forEach((row) => {
        row.style.display = row.innerText.toLowerCase().includes(q) ? "" : "none";
      });
    });
  }

  document.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const target = document.querySelector(btn.getAttribute("data-copy"));
      if (!target) return;
      const old = btn.textContent;
      try {
        await navigator.clipboard.writeText(target.innerText);
        btn.textContent = "Copied";
      } catch (_) {
        btn.textContent = "Failed";
      }
      setTimeout(() => {
        btn.textContent = old;
      }, 1000);
    });
  });

  initWalkthrough();

  const endpointDetails = document.getElementById("openapiEndpointDetails");
  const schemaDocs = document.getElementById("openapiSchemaDocs");
  if (endpointDetails || schemaDocs) {
    renderOpenApiDocs(endpointDetails, schemaDocs);
  }
})();

function initWalkthrough() {
  const root = document.querySelector("[data-walkthrough]");
  if (!root) return;

  const executionId = "9c7a1f2e-3db0-4e4b-9c5e-2f8b6d5c1a77";
  const definitionRequest = {
    name: "order-fulfillment",
    version: "v1",
    failureHandling: {
      type: "retry",
      maxAttempts: 3,
      delayMillis: 500
    },
    steps: [
      {
        name: "reserve-inventory",
        up: {
          url: "http://inventory/reserve",
          verb: "POST",
          body: {
            orderId: "{{payload.orderId}}",
            items: "{{payload.items}}"
          }
        },
        down: {
          url: "http://inventory/release",
          verb: "POST",
          body: {
            orderId: "{{payload.orderId}}"
          }
        }
      },
      {
        name: "charge-payment",
        up: {
          url: "http://payment/charge",
          verb: "POST",
          body: {
            orderId: "{{payload.orderId}}",
            amount: "{{payload.amount}}"
          }
        },
        down: {
          url: "http://payment/refund",
          verb: "POST",
          body: {
            orderId: "{{payload.orderId}}"
          }
        }
      }
    ],
    onFailureCallback: {
      url: "http://notifications/workflow-failed",
      verb: "POST",
      body: {
        orderId: "{{payload.orderId}}"
      }
    }
  };

  const snapshots = [
    {
      tone: "neutral",
      status: "READY",
      currentStep: "definition-stored",
      label: "Request",
      primary: {
        type: "http",
        method: "POST",
        path: "/sagas/definitions",
        headers: ["Content-Type: application/json"],
        body: definitionRequest
      },
      logs: ["definition received", "definition validated", "definition stored"],
      badges: ["persisted", "definition"],
      timeline: ["active", "idle", "idle", "idle", "idle", "idle", "optional"],
      activePill: 0
    },
    {
      tone: "neutral",
      status: "RUNNING",
      currentStep: "reserve-inventory",
      label: "Request",
      primary: {
        type: "http",
        method: "POST",
        path: "/sagas/definitions/order-fulfillment/v1/run",
        headers: ["Content-Type: application/json"],
        body: {
          payload: {
            orderId: "ORD-123",
            amount: 250.0,
            items: [
              { sku: "ABC", qty: 2 }
            ]
          }
        }
      },
      secondary: {
        label: "Response",
        type: "json",
        body: {
          id: executionId
        }
      },
      logs: ["execution created", "execution persisted", "first step queued"],
      badges: ["persisted", "queued"],
      timeline: ["completed", "active", "idle", "idle", "idle", "idle", "optional"],
      activePill: 1
    },
    {
      tone: "success",
      status: "RUNNING",
      currentStep: "charge-payment",
      label: "Runtime block",
      primary: {
        type: "json",
        body: {
          step: "reserve-inventory",
          request: {
            url: "http://inventory/reserve",
            verb: "POST",
            body: {
              orderId: "ORD-123",
              items: [
                { sku: "ABC", qty: 2 }
              ]
            }
          },
          response: {
            reservationId: "resv-987",
            status: "reserved"
          },
          result: "success"
        }
      },
      logs: ["reserve-inventory queued", "reserve-inventory started", "reserve-inventory completed"],
      badges: ["success", "persisted"],
      timeline: ["completed", "completed", "active", "idle", "idle", "idle", "optional"],
      activePill: 2
    },
    {
      tone: "failure",
      status: "RUNNING",
      currentStep: "reserve-inventory:down",
      label: "Runtime block",
      primary: {
        type: "json",
        body: {
          step: "charge-payment",
          request: {
            url: "http://payment/charge",
            verb: "POST",
            body: {
              orderId: "ORD-123",
              amount: 250.0
            }
          },
          response: {
            code: "PAYMENT_TIMEOUT",
            message: "gateway timeout"
          },
          result: "failure"
        }
      },
      logs: ["charge-payment queued", "charge-payment started", "charge-payment failed", "compensation scheduled"],
      badges: ["failed", "retry-policy", "compensation"],
      timeline: ["completed", "completed", "completed", "active", "idle", "idle", "optional"],
      activePill: 3
    },
    {
      tone: "compensation",
      status: "RUNNING",
      currentStep: "finalizing-failure",
      label: "Runtime block",
      primary: {
        type: "json",
        body: {
          step: "reserve-inventory",
          compensation: {
            url: "http://inventory/release",
            verb: "POST",
            body: {
              orderId: "ORD-123"
            }
          },
          response: {
            status: "released"
          },
          result: "compensated"
        }
      },
      logs: [
        "reserve-inventory compensation queued",
        "reserve-inventory compensation started",
        "reserve-inventory compensation completed"
      ],
      badges: ["compensated", "rollback"],
      timeline: ["completed", "completed", "completed", "failed", "active", "idle", "optional"],
      activePill: 4
    },
    {
      tone: "api",
      status: "FAILED",
      currentStep: "none",
      label: "Request",
      primary: {
        type: "http",
        method: "GET",
        path: `/sagas/${executionId}`
      },
      secondary: {
        label: "Response",
        type: "json",
        body: {
          id: executionId,
          name: "order-fulfillment",
          version: "v1",
          status: "FAILED",
          startedAt: "2026-03-16T14:10:00Z",
          updatedAt: "2026-03-16T14:10:06Z"
        }
      },
      logs: ["execution marked failed", "state persisted", "status available via API"],
      badges: ["failed", "persisted", "inspectable"],
      timeline: ["completed", "completed", "completed", "failed", "compensated", "active", "optional"],
      activePill: 5
    },
    {
      tone: "api",
      status: "FAILED",
      currentStep: "callback-complete",
      label: "Runtime block",
      primary: {
        type: "json",
        body: {
          callback: "onFailureCallback",
          request: {
            url: "http://notifications/workflow-failed",
            verb: "POST",
            body: {
              orderId: "ORD-123"
            }
          },
          response: {
            status: "accepted"
          },
          result: "success"
        }
      },
      logs: ["onFailureCallback queued", "onFailureCallback sent", "failure notification accepted"],
      badges: ["callback", "optional"],
      timeline: ["completed", "completed", "completed", "failed", "compensated", "completed", "active"],
      activePill: 6
    }
  ];

  const pillLabels = [
    "stored definition",
    "run request",
    "step success",
    "step failure",
    "compensation",
    "final status",
    "callback"
  ];

  const steps = Array.from(root.querySelectorAll("[data-walkthrough-step]"));
  const panel = root.querySelector("[data-walkthrough-panel]");
  const pills = root.querySelector("[data-walkthrough-pills]");
  const execution = root.querySelector("[data-walkthrough-execution]");
  const status = root.querySelector("[data-walkthrough-status]");
  const statusWrap = root.querySelector("[data-walkthrough-status-wrap]");
  const currentStep = root.querySelector("[data-walkthrough-current-step]");
  const label = root.querySelector("[data-walkthrough-label]");
  const code = root.querySelector("[data-walkthrough-code]");
  const secondary = root.querySelector("[data-walkthrough-secondary]");
  const secondaryLabel = root.querySelector("[data-walkthrough-secondary-label]");
  const secondaryCode = root.querySelector("[data-walkthrough-secondary-code]");
  const log = root.querySelector("[data-walkthrough-log]");
  const badges = root.querySelector("[data-walkthrough-badges]");
  const prev = root.querySelector("[data-walkthrough-prev]");
  const replay = root.querySelector("[data-walkthrough-replay]");
  const next = root.querySelector("[data-walkthrough-next]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let index = 0;
  let timer = null;
  let inView = false;
  let paused = false;

  pills.innerHTML = pillLabels.map((item, pillIndex) => `
    <span class="walkthrough-stage-pill${pillIndex === 0 ? " is-active" : ""}">${escapeHtml(item)}</span>
  `).join("");

  function applySnapshot(nextIndex) {
    index = nextIndex;
    const snapshot = snapshots[index];

    steps.forEach((step, stepIndex) => {
      const stepState = snapshot.timeline[stepIndex];
      step.dataset.state = stepState;
      step.querySelector(".walkthrough-step-icon").textContent = timelineIcon(stepState, stepIndex + 1);
      step.querySelector(".walkthrough-step-state").textContent = stepState;
    });

    panel.dataset.tone = snapshot.tone;
    execution.textContent = executionId;
    status.textContent = snapshot.status;
    statusWrap.dataset.status = snapshot.status;
    currentStep.textContent = snapshot.currentStep;
    label.textContent = snapshot.label;
    code.innerHTML = renderWalkthroughBlock(snapshot.primary);

    if (snapshot.secondary) {
      secondary.hidden = false;
      secondaryLabel.textContent = snapshot.secondary.label;
      secondaryCode.innerHTML = renderWalkthroughBlock(snapshot.secondary);
    } else {
      secondary.hidden = true;
      secondaryLabel.textContent = "";
      secondaryCode.innerHTML = "";
    }

    log.innerHTML = snapshot.logs.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("");
    badges.innerHTML = snapshot.badges.map((entry) => `<span class="walkthrough-badge">${escapeHtml(entry)}</span>`).join("");

    pills.querySelectorAll(".walkthrough-stage-pill").forEach((pill, pillIndex) => {
      pill.classList.toggle("is-active", pillIndex === snapshot.activePill);
    });

    if (!reducedMotion.matches) {
      panel.classList.remove("is-updating");
      void panel.offsetWidth;
      panel.classList.add("is-updating");
    }
  }

  function clearPlayback() {
    if (timer) {
      window.clearTimeout(timer);
      timer = null;
    }
  }

  function schedulePlayback() {
    clearPlayback();
    if (!inView || paused || reducedMotion.matches) return;
    const delay = index === snapshots.length - 1 ? 3250 : 2600;
    timer = window.setTimeout(() => {
      applySnapshot((index + 1) % snapshots.length);
      schedulePlayback();
    }, delay);
  }

  function handleManualNavigation(nextIndex) {
    applySnapshot((nextIndex + snapshots.length) % snapshots.length);
    schedulePlayback();
  }

  const observer = new IntersectionObserver((entries) => {
    const entry = entries[0];
    inView = Boolean(entry && entry.isIntersecting && entry.intersectionRatio >= 0.35);
    if (inView) {
      schedulePlayback();
    } else {
      clearPlayback();
    }
  }, { threshold: [0, 0.35, 0.6] });

  observer.observe(root);

  root.addEventListener("mouseenter", () => {
    paused = true;
    clearPlayback();
  });

  root.addEventListener("mouseleave", () => {
    paused = false;
    schedulePlayback();
  });

  steps.forEach((step, stepIndex) => {
    step.addEventListener("click", () => {
      handleManualNavigation(stepIndex);
    });

    step.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      handleManualNavigation(stepIndex);
    });
  });

  prev.addEventListener("click", () => {
    handleManualNavigation(index - 1);
  });

  replay.addEventListener("click", () => {
    handleManualNavigation(0);
  });

  next.addEventListener("click", () => {
    handleManualNavigation(index + 1);
  });

  if (typeof reducedMotion.addEventListener === "function") {
    reducedMotion.addEventListener("change", () => {
      schedulePlayback();
    });
  }

  applySnapshot(0);
}

async function renderOpenApiDocs(endpointHost, schemaHost) {
  try {
    const res = await fetch("https://raw.githubusercontent.com/thiagoribeiro/trama/main/openapi.json", { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Failed to load openapi.json (${res.status})`);
    }
    const spec = await res.json();
    if (endpointHost) {
      endpointHost.innerHTML = renderEndpointDetails(spec);
    }
    if (schemaHost) {
      schemaHost.innerHTML = renderSchemaDocs(spec);
    }
  } catch (err) {
    const msg = `<p class="muted">Unable to render OpenAPI details: ${escapeHtml(String(err.message || err))}</p>`;
    if (endpointHost) endpointHost.innerHTML = msg;
    if (schemaHost) schemaHost.innerHTML = msg;
  }
}

function renderEndpointDetails(spec) {
  const paths = spec.paths || {};
  const methodOrder = ["get", "post", "put", "patch", "delete", "options", "head"];
  const cards = [];

  Object.keys(paths).sort().forEach((path) => {
    const item = paths[path] || {};
    methodOrder.forEach((method) => {
      const op = item[method];
      if (!op) return;
      const reqSchema = op.requestBody?.content?.["application/json"]?.schema;
      const reqText = reqSchema ? schemaToHtml(reqSchema, spec) : "none";
      const responses = Object.keys(op.responses || {}).sort().map((status) => {
        const content = op.responses[status]?.content?.["application/json"]?.schema;
        return `<li><code>${escapeHtml(status)}</code>: ${content ? schemaToHtml(content, spec) : "no body"}</li>`;
      }).join("");

      cards.push(`
        <article class="api-card">
          <div class="api-card-head">
            <span class="method ${methodClass(method)}">${method.toUpperCase()}</span>
            <span class="api-card-path">${escapeHtml(path)}</span>
          </div>
          <p class="muted">${escapeHtml(op.summary || op.description || "No summary provided.")}</p>
          <p><strong>Request:</strong> ${reqSchema ? reqText : "<code>none</code>"}</p>
          <p><strong>Responses:</strong></p>
          <ul>${responses || "<li><code>default</code>: no body</li>"}</ul>
        </article>
      `);
    });
  });
  return cards.join("");
}

function renderSchemaDocs(spec) {
  const schemas = spec.components?.schemas || {};
  const priority = [
    "RunSagaRequest",
    "RunStoredSagaRequest",
    "SagaDefinitionCreateRequest",
    "SagaDefinition",
    "SagaStep",
    "HttpCall",
    "FailureHandling",
    "FailureHandlingRetry",
    "FailureHandlingBackoff",
    "SagaStatusResponse",
    "SagaCreateResponse",
    "ValidationErrorResponse",
    "SagaRetryResponse"
  ];

  const ordered = [
    ...priority.filter((name) => schemas[name]),
    ...Object.keys(schemas).filter((name) => !priority.includes(name)).sort()
  ];

  return ordered.map((name) => {
    const schema = schemas[name];
    const resolved = resolveSchema(schema, spec);
    const schemaType = schemaToString(schema);
    const rows = propertyRows(resolved, spec);
    const description = schema.description ? `<div class="schema-meta">${escapeHtml(schema.description)}</div>` : "";
    return `
      <section class="schema-block" id="${escapeHtml(schemaAnchorId(name))}">
        <h4>${escapeHtml(name)}</h4>
        <div class="schema-meta">Type: ${schemaToHtml(schema, spec)}</div>
        ${description}
        ${rows.length ? `
          <table>
            <thead><tr><th>Field</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
            <tbody>${rows.join("")}</tbody>
          </table>
        ` : `<p class="muted">No direct object properties (union/ref/primitive schema).</p>`}
      </section>
    `;
  }).join("");
}

function propertyRows(schema, spec) {
  if (!schema || schema.type !== "object" || !schema.properties) return [];
  const required = new Set(schema.required || []);
  return Object.keys(schema.properties).sort().map((key) => {
    const prop = schema.properties[key];
    return `
      <tr>
        <td><code>${escapeHtml(key)}</code></td>
        <td>${schemaToHtml(prop, spec)}</td>
        <td>${required.has(key) ? "yes" : "no"}</td>
        <td>${escapeHtml(prop.description || "")}</td>
      </tr>
    `;
  });
}

function resolveSchema(schema, spec) {
  if (!schema) return null;
  if (schema.$ref) {
    const ref = getRef(schema.$ref, spec);
    return ref || schema;
  }
  if (schema.allOf && schema.allOf.length === 1) {
    return resolveSchema(schema.allOf[0], spec);
  }
  return schema;
}

function getRef(ref, spec) {
  const prefix = "#/components/schemas/";
  if (!ref || !ref.startsWith(prefix)) return null;
  const name = ref.slice(prefix.length);
  return spec.components?.schemas?.[name] || null;
}

function schemaToString(schema) {
  if (!schema) return "unknown";
  if (schema.$ref) return schema.$ref.replace("#/components/schemas/", "");
  if (schema.enum) return `enum(${schema.enum.join(", ")})`;
  if (schema.oneOf) return `oneOf(${schema.oneOf.map(schemaToString).join(" | ")})`;
  if (schema.anyOf) return `anyOf(${schema.anyOf.map(schemaToString).join(" | ")})`;
  if (schema.allOf) return `allOf(${schema.allOf.map(schemaToString).join(" & ")})`;
  if (schema.type === "array") return `array<${schemaToString(schema.items)}>`;
  if (schema.type === "object" && schema.additionalProperties) {
    const inner = schema.additionalProperties === true ? "any" : schemaToString(schema.additionalProperties);
    return `object<string, ${inner}>`;
  }
  const suffix = schema.format ? `(${schema.format})` : "";
  return `${schema.type || "object"}${suffix}`;
}

function schemaToHtml(schema, spec) {
  if (!schema) return "<code>unknown</code>";
  if (schema.$ref) {
    const name = schemaNameFromRef(schema.$ref);
    if (name && spec?.components?.schemas?.[name]) {
      return `<code><a class="type-link" href="#${escapeHtml(schemaAnchorId(name))}">${escapeHtml(name)}</a></code>`;
    }
    return `<code>${escapeHtml(schemaToString(schema))}</code>`;
  }
  if (schema.enum) {
    return `<code>${escapeHtml(`enum(${schema.enum.join(", ")})`)}</code>`;
  }
  if (schema.oneOf) {
    return `<code>oneOf(</code>${schema.oneOf.map((s) => schemaToHtml(s, spec)).join("<code> | </code>")}<code>)</code>`;
  }
  if (schema.anyOf) {
    return `<code>anyOf(</code>${schema.anyOf.map((s) => schemaToHtml(s, spec)).join("<code> | </code>")}<code>)</code>`;
  }
  if (schema.allOf) {
    return `<code>allOf(</code>${schema.allOf.map((s) => schemaToHtml(s, spec)).join("<code> & </code>")}<code>)</code>`;
  }
  if (schema.type === "array") {
    return `<code>array&lt;</code>${schemaToHtml(schema.items, spec)}<code>&gt;</code>`;
  }
  if (schema.type === "object" && schema.additionalProperties) {
    const inner = schema.additionalProperties === true
      ? "<code>any</code>"
      : schemaToHtml(schema.additionalProperties, spec);
    return `<code>object&lt;string, </code>${inner}<code>&gt;</code>`;
  }
  return `<code>${escapeHtml(schemaToString(schema))}</code>`;
}

function schemaNameFromRef(ref) {
  const prefix = "#/components/schemas/";
  if (!ref || !ref.startsWith(prefix)) return null;
  return ref.slice(prefix.length);
}

function schemaAnchorId(name) {
  return `schema-${name}`;
}

function methodClass(method) {
  if (method === "get") return "get";
  if (method === "post") return "post";
  if (method === "put" || method === "patch") return "put";
  if (method === "delete") return "delete";
  return "get";
}

function renderWalkthroughBlock(block) {
  if (!block) return "";
  if (block.type === "http") {
    return renderWalkthroughHttp(block);
  }
  if (block.type === "json") {
    return highlightWalkthroughJson(block.body);
  }
  return "";
}

function renderWalkthroughHttp(block) {
  const lines = [
    `<span class="token-method">${escapeHtml(block.method)}</span> <span class="token-path">${escapeHtml(block.path)}</span>`
  ];

  (block.headers || []).forEach((header) => {
    lines.push(`<span class="token-header">${escapeHtml(header)}</span>`);
  });

  if (typeof block.body !== "undefined") {
    lines.push("");
    lines.push(highlightWalkthroughJson(block.body));
  }

  return lines.join("\n");
}

function highlightWalkthroughJson(value) {
  const raw = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const escaped = escapeHtml(raw);
  return escaped.replace(
    /("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?|\btrue\b|\bfalse\b|\bnull\b)/g,
    (match) => {
      let cls = "token-number";
      if (match.startsWith("\"")) {
        cls = match.endsWith(":") ? "token-key" : "token-string";
      } else if (match === "true" || match === "false") {
        cls = "token-boolean";
      } else if (match === "null") {
        cls = "token-null";
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

function timelineIcon(state, number) {
  if (state === "completed") return "✓";
  if (state === "failed") return "!";
  if (state === "compensated") return "↺";
  if (state === "active") return "•";
  if (state === "optional") return "?";
  return String(number);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

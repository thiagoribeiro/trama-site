(function () {
  const path = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll("[data-nav]").forEach((link) => {
    if (link.getAttribute("href") === path) {
      link.classList.add("active");
    }
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

  const endpointDetails = document.getElementById("openapiEndpointDetails");
  const schemaDocs = document.getElementById("openapiSchemaDocs");
  if (endpointDetails || schemaDocs) {
    renderOpenApiDocs(endpointDetails, schemaDocs);
  }
})();

async function renderOpenApiDocs(endpointHost, schemaHost) {
  try {
    const res = await fetch("../openapi.json", { cache: "no-store" });
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

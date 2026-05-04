import { ViteModeOptions } from "./singlePageAppUtils";

type DefinedCspDirectiveName = (typeof ViteModeCspPolicy.cspDirectiveNames)[keyof typeof ViteModeCspPolicy.cspDirectiveNames];
type CspDirectiveName = DefinedCspDirectiveName | string;

export class ViteModeCspPolicy {
  private directiveMap: Map<CspDirectiveName, Set<string>>;

  constructor(cspPolicyString?: string) {
    this.directiveMap = new Map();
    if (!cspPolicyString || cspPolicyString.length === 0) {
      return;
    }
    for (const directiveElement of cspPolicyString.trim().split(";")) {
      const [name, ...elements] = directiveElement.trim().split(/\s+/g);
      this.directiveMap.set(name.toLowerCase(), new Set(elements));
    }
  }

  addToDirective(directiveName: CspDirectiveName, elements: Set<string>): ViteModeCspPolicy {
    const directiveSet = this.directiveMap.get(directiveName.toLowerCase().trim()) || new Set();
    for (const element of elements) {
      directiveSet.add(element);
    }
    return this;
  }

  merge(other: ViteModeCspPolicy) {
    for (const [k, v] of other.directiveMap.entries()) {
      this.addToDirective(k, v);
    }
    return this;
  }

  removeFromDirective(directiveName: CspDirectiveName, elements: Set<string>) {
    const directiveSet = this.directiveMap.get(directiveName.trim().toLowerCase());
    if (directiveSet) {
      for (const element of elements) {
        directiveSet.delete(element);
      }
    }
    return this;
  }

  removeDirective(dirctiveName: CspDirectiveName) {
    this.directiveMap.delete(dirctiveName.toLowerCase().trim());
    return this;
  }

  asString() {
    const out: string[] = [];
    for (const name of this.directiveMap.keys()) {
      const elms = this.directiveMap.get(name);
      if (elms) {
        const elmStrList = elms.values().toArray().join(", ");
        out.push(name + " " + elmStrList);
      } else {
        out.push(name);
      }
    }
    return out.join("; ");
  }

  static cspDirectiveNames = {
    baseUri: "base-uri",
    childSrc: "child-src",
    connectSrc: "connect-src",
    defaultSrc: "default-src",
    fontSrc: "font-src",
    formAction: "form-action",
    frameAncestors: "frame-ancestors",
    frameSrc: "frame-src",
    imgSrc: "img-src",
    manifestSrc: "manifest-src",
    mediaSrc: "media-src",
    objectSrc: "object-src",
    pluginTypes: "plugin-types",
    reportUri: "report-uri",
    sandbox: "sandbox",
    scriptSrc: "script-src",
    scriptSrcElem: "script-src-elem",
    scriptSrcAttr: "script-src-attr",
    styleSrc: "style-src",
    upgradeInsecureRequests: "upgrade-insecure-requests",
  } as const;

  static getRequiredCspPolicyForViteMode(nonce: string, options: ViteModeOptions): ViteModeCspPolicy {
    const out = new ViteModeCspPolicy();
    {
      /*
       * We need the following CSP:
       * script-src-elem: to enable the inline script that makes refresh work
       * connect-src: to enable actual live reloading through websocket
       * img-src: to enable loading images from the dev-server instead of the actual server
       */
      const httpAddress = `http://localhost:${options.port}`;
      const wsAddress = `ws://localhost:${options.port}`;
      const nonceCSP = options.useNonce ? `'nonce-${nonce}'` : "";
      out.addToDirective(ViteModeCspPolicy.cspDirectiveNames.scriptSrcElem, new Set([nonceCSP, httpAddress]));
      out.addToDirective(ViteModeCspPolicy.cspDirectiveNames.connectSrc, new Set(["'self'", wsAddress]));
      out.addToDirective(ViteModeCspPolicy.cspDirectiveNames.imgSrc, new Set(["'self'", httpAddress]));
    }
    return out;
  }
}

const phantom = require('phantom');
const crypto = require('crypto');

(async function() {
  const url = 'http://www.coindesk.com/ethereum-price/';

  const instance = await phantom.create();
  const page = await instance.createPage();
  // await page.on("onResourceRequested", function(requestData) {});

  const status = await page.open(url);
  const content = await page.property('content');

  let grabContent = null;

  await page.evaluate( function() {
    var baseElements = [];

    var globalElementSelectorPath = function(element) {
      // Recurse upward to build a set of selector strings to find the element later
      selectors = [];
      var e = element;
      while(e && e.tagName != 'BODY') {
        selectors.push(
          {
            tagName: e.tagName,
            classList: e.classList,
            id: e.id
          }
        );
        e = e.parentElement;
      }

      var selectorStrings = [];
      selectors.map( function(selector) {
        if(selector == null ) { debugger;}
        var selectorString = selector.tagName;

        if(selector.id.length > 0) {
          selectorString = selectorString + '#' + selector.id
        } else {
          for(var ci = 0; ci < selector.classList.length; ci++) {
            selectorString += '.' + selector.classList[ci];
          }
        }
        return selectorStrings.push(selectorString);
      });

      return selectorStrings;
    }

    var accumulateBaseElements = function(element) {
      if(element.children && element.children.length > 0) {
        for(var i = 0; i < element.children.length; i++){
          accumulateBaseElements(element.children[i]);
        }
      } else if(element.textContent.length > 0 && ['STYLE', 'SCRIPT'].indexOf(element.tagName) == -1) {
        baseElements.push({text: element.textContent, selector_path: globalElementSelectorPath(element)});
      }
    }

    accumulateBaseElements(document.body);
    return baseElements;
  }).then( (_grabContent) => {
    grabContent = _grabContent;
  });

  const screenshotHashKey = `${Date.now()}_${url}`;
  const screenshotHash = crypto.createHash('sha256');

  screenshotHash.update('awfawefw');
  const screnshotHashValue = screenshotHash.digest('hex');
  await page.render(`initial_grab_${screnshotHashValue}.png`);

  console.log(grabContent);

  await instance.exit();
  process.exit();
}());

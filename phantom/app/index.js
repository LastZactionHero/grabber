console.log('Loading a web page');
var page = require('webpage').create();
var url = 'http://www.coindesk.com/ethereum-price/';
page.open(url, function (status) {
  var price = page.evaluate( function() {
    return document.getElementById('cdbpidata').children[1].children[0].textContent
  });
  console.log(price);
  phantom.exit();
});
      

// Find every terminating element on the page with text content
baseElements = [];
function recurseToChildNodes(element) {
  if(element.children.length > 0) {
    for(var i = 0; i < element.children.length; i++){
      recurseToChildNodes(element.children[i]);
    }
  } else if(element.textContent.length > 0 && ['STYLE', 'SCRIPT'].indexOf(element.tagName) == -1) {
    baseElements.push(element);
  }
}
recurseToChildNodes(document.body);

// Build a global selector string to find every terminating element
baseElementsWithSelectors = [];
baseElements.forEach( function(element) {
  baseElementsWithSelectors.push({
    element: element,
    textContent: element.textContent,
    selectorStrings: globalElementSelectorStrings(element)
  })
});

baseElementsWithSelectors.forEach( function(be) {
  console.log(be.textContent)
  // if(be.selectorStrings) {
  // console.log(be.selectorStrings.join())
  // }
})


function globalElementSelectorStrings(element) {
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
      selector.classList.forEach( function(c) { 
        selectorString += '.' + c
      })
    }
    return selectorStrings.push(selectorString);
  });

  return selectorStrings;
}

function findBySelectorStrings(selectorStrings) {
  // Select with selector strings
  selectorQuery = document;
  while(selectorString = selectorStrings.pop()) {
    selectorQuery = selectorQuery.querySelector(selectorString);
  }
  return selectorQuery.textContent;
}
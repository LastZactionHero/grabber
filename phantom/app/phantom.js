/* 
  Scrape web content with Phantom JS

  This script has two operations:
  - Initial Grab: pulls all content for a website, formatted as selectors for querying later
      Inbound Message: {
          request_token: <string>, 
          request_type: 'initial_grab', 
          url: <string>
        }
      Outbound Message: {
          request_token: <string>
          request_type: 'initial_grab',
          status: 'success/fail',
          content: [
            {
              selector_path: ['<string>', '<string>', '<string>'],
              text: ['<string>', '<string>', '<string>']
            }
          ]
          screenshot: <string base64 encoded png>
        }
  - Value Grab: get the current value of a website element from a known selector
      Inbound Message: {
          request_token: <string>,
          request_type: 'value_grab',
          url: <string>,
          selector_path: ['<string>', '<string>', ...]
        }
      Outbound Message: {
          request_token: <string>,
          request_type: 'value_grab',
          url: <string>,
          status: 'success/fail',
          values: [
            {
              href: '<string> (optional)',
              src: '<string> (optional)',
              text: '<string>'
            }
          ]
        }

  RabbitMQ Channels:
  - phantom_request: Inbound requests for scraping
  - phantom_response: Outbound responses with scraping data

*/
const phantom = require('phantom');
const crypto = require('crypto');
const fs = require('fs')

const USER_AGENT = 'Mozilla/5.0 (Linux; GoogleTV 4.0.4; LG Google TV Build/000000) AppleWebKit/534.24 (KHTML, like Gecko) Chrome/11.0.696.77 Safari/534.24';

const Logger = {
  log: (level, message) => {
    console.log(`${level}: ${message}`);
  }
}

const amqp = require('amqplib/callback_api');
amqp.connect('amqp://messaging', (err, conn) => {
  // Connect to the inbound request queue
  conn.createChannel( (err, channel) => {
    // Create request and response queues
    const requestQueueName = 'phantom_request';
    const responseQueueName = 'phantom_response';
    channel.assertQueue(requestQueueName, {durable: false});
    channel.assertQueue(responseQueueName, {durable: false});

    Logger.log('INFO', 'Waiting for requests');
    channel.consume(requestQueueName, (msg) => {
      const message = JSON.parse(msg.content.toString());
      Logger.log('INFO', 'Request received');
      Logger.log('INFO', msg.content.toString());

      // Generic callback for responding to a request
      const responseCallback = (grab) => {
        var response = baseResponse(message);
        Object.assign(response, grab);
        channel.sendToQueue(responseQueueName, new Buffer(JSON.stringify(response)));
      }

      switch(message.request_type) {
        case 'initial_grab':
          Logger.log('INFO', 'initial_grab');
          initialPageGrab(message.url, responseCallback);
          break;
        case 'value_grab':
          Logger.log('INFO', 'value_grab');
          valueGrab(message.url, message.selector_path, responseCallback);
          break;
        default:
          Logger.log('ERROR', `Unknown request_type: ${message.request_type}`);
          break;
      }
      
    }, {noAck: true});
  });
});

// Basic details delivered in every response
function baseResponse(message) {
  return {
    request_token: message.request_token,
    request_type: message.request_type,
    url: message.url
  }
}

// Grab a value from site given a known selector
function valueGrab(url, selectorPath, completeCallback) {
  (async function() {
    const instance = await phantom.create();
    const page = await instance.createPage();
    page.setting('userAgent', USER_AGENT)
  
    const response = {
      status: await page.open(url),
      values: null
    }

    await page.evaluate( function(selectorPath) {
      // Run on page in Phantom: no access to ES6 in this block

      // Find matching elements by the selectorPath
      var queryStack = [document];
      while(p = selectorPath.pop()) {
        var nextQueryStack = [];
        for(var i = 0; i < queryStack.length; i++) {
          var found = queryStack[i].querySelectorAll(p);
          for(var j = 0; j < found.length; j++) {
            nextQueryStack.push(found[j])
          }
        }
        queryStack = nextQueryStack;
      }

      // Collect values for matching elements
      var values = [];
      for(var i = 0; i < queryStack.length; i++) {
        var element = queryStack[i];
        value = {};
        if(element.textContent) value.text = element.textContent;
        if(element.href) value.href = element.href;
        if(element.src) value.src = element.src;
        values.push(value);
      }
      return values;
    }, selectorPath).then( (_values) => {
      response.values = _values;
    });

    await instance.exit();

    Logger.log('INFO', `value_grab complete, status: ${response.status}`);
    completeCallback(response);
  }());

}

// Grab all site content for creating a new selector
function initialPageGrab(url, completeCallback) {
  (async function() {
    const instance = await phantom.create();
    const page = await instance.createPage();
    page.setting('userAgent', USER_AGENT)

    const response = {
      status: await page.open(url),
      content: null,
      screenshot: null
    };

    let grabContent = null;
    await page.evaluate( function() {
      // Run on page in Phantom: no access to ES6 in this block
      var baseElements = {};

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
          var selectorPath = globalElementSelectorPath(element);
          var selectorUniquenessKey = selectorPath.join("_")

          if(baseElements[selectorUniquenessKey]) {
            baseElements[selectorUniquenessKey].text.push(element.textContent)
          } else {
            baseElements[selectorUniquenessKey] = {
              text: [element.textContent],
              selector_path: selectorPath};
          }

        }
      }

      accumulateBaseElements(document.body);
      
      return baseElements;
    }).then( (_content) => {
      grabContent = _content;
    });

    // Map from hash with unique keys to array
    response.content = []
    for (var selectorUniquenessKey in grabContent) {
      if (grabContent.hasOwnProperty(selectorUniquenessKey)) {
        response.content.push(grabContent[selectorUniquenessKey]);
      }
    }

    // Take a screenshot
    const screenshotHashKey = `${Date.now()}_${url}`;
    const screenshotHash = crypto.createHash('sha256');
    screenshotHash.update(screenshotHashKey);
    const screnshotHashValue = screenshotHash.digest('hex');
    const screenshotPath = `initial_grab_${screnshotHashValue}.png`;
    await page.render(screenshotPath);

    const screenshotFileBuffer = fs.readFileSync(screenshotPath);
    // response.screenshot = screenshotFileBuffer.toString('base64');
    fs.unlinkSync(screenshotPath);

    await instance.exit();

    Logger.log('INFO', `initial_grab complete, status: ${response.status}`);
    completeCallback(response);
  }());
}





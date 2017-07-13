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
          value: [
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

const amqp = require('amqplib/callback_api');
amqp.connect('amqp://messaging', (err, conn) => {

  // Connect to the inbound request queue
  conn.createChannel( (err, channel) => {
    const requestQueueName = 'phantom_request';
    const responseQueueName = 'phantom_response';

    channel.assertQueue(requestQueueName, {durable: false});
    channel.assertQueue(responseQueueName, {durable: false});
    console.log("Waiting for requests");

    channel.consume(requestQueueName, (msg) => {
      
      const message = JSON.parse(msg.content.toString());

      switch(message.request_type) {
        case 'initial_grab':
          initialPageGrab(message.url, (grab) => {
            grab.request_token = message.request_token;
            grab.request_type = message.request_type;
            grab.url = message.url;
            console.log("REsponding with: ")
            console.log(JSON.stringify(grab));
            channel.sendToQueue(responseQueueName, new Buffer(JSON.stringify(grab)));
            console.log("Done!")
          });
          break;
        case 'value_grab':
          valueGrab(message.url, message.selector_path, (grab) => {
            grab.request_token = message.request_token;
            grab.request_type = message.request_type;
            grab.url = message.url;
            channel.sendToQueue(responseQueueName, new Buffer(JSON.stringify(grab)));
          });
          break;
        default:
          // TODO: Error handling
          break;
      }
      
    }, {noAck: true});
  });
});

function valueGrab(url, selectorPath, completeCallback) {
  console.log('valueGrab');
  console.log(url);
  console.log(selectorPath);

    (async function() {
    const instance = await phantom.create();
    const page = await instance.createPage();
    // await page.on("onResourceRequested", function(requestData) {});

    const status = await page.open(url);
    let grabContent = null;
    let screenshotPath = null;

    await page.defineMethod('selectorPath', function() {
      return selectorPath;
    });

    await page.evaluate( function(selectorPath) {
      // Select with selector strings
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
    }, selectorPath).then( (_grabContent) => {
      grabContent = _grabContent;
    });

    await instance.exit();

    completeCallback({
      status: status,
      value: grabContent
    });
  }());

}

function initialPageGrab(url, completeCallback) {
  (async function() {
    const instance = await phantom.create();
    const page = await instance.createPage();
    // await page.on("onResourceRequested", function(requestData) {});
    page.setting('userAgent', 'Mozilla/5.0 (Linux; GoogleTV 4.0.4; LG Google TV Build/000000) AppleWebKit/534.24 (KHTML, like Gecko) Chrome/11.0.696.77 Safari/534.24')
    const status = await page.open(url);
    console.log(status)

    let grabContent = null;
    let screenshotPath = null;

    await page.evaluate( function() {
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
    }).then( (_grabContent) => {
      grabContent = _grabContent;
    });

    var selectorContent = []
    for (var selectorUniquenessKey in grabContent) {
      if (grabContent.hasOwnProperty(selectorUniquenessKey)) {
        selectorContent.push(grabContent[selectorUniquenessKey]);
      }
    }

    const screenshotHashKey = `${Date.now()}_${url}`;
    const screenshotHash = crypto.createHash('sha256');
    screenshotHash.update(screenshotHashKey);
    const screnshotHashValue = screenshotHash.digest('hex');
    screenshotPath = `initial_grab_${screnshotHashValue}.png`;
    await page.render(screenshotPath);

    const screenshotFileBuffer = fs.readFileSync(screenshotPath);
    const screenshotBase64 = screenshotFileBuffer.toString('base64');
    fs.unlinkSync(screenshotPath);

    await instance.exit();

    console.log(selectorContent);

    completeCallback({
      status: status,
      content: selectorContent
      // screenshot: screenshotBase64
    });
  }());

  
}





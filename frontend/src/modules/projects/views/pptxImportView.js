define(function (require) {
  var Origin = require('core/origin');
  var OriginView = require('core/views/originView');
  var JSZip = require('jszip');

  return OriginView.extend({
    tagName: 'div',
    className: 'pptxImport',

    events: {
      'change .asset-file': 'onFileUpload',
    },

    templateContext: function () {
      return {};
    },

    onFileUpload: function (event) {
      const fileInput = event.target.files[0];
      if (fileInput && fileInput.name.endsWith('.pptx')) {
        const reader = new FileReader();

        reader.onload = async (e) => {
          try {
            const zip = await JSZip.loadAsync(e.target.result);
            let xmlOutput = '';

            // Extract XML files and display content
            zip.forEach((relativePath, file) => {
              if (relativePath.startsWith('ppt/slides/') && relativePath.endsWith('.xml')) {
                file.async('text').then((content) => {
                  xmlOutput += `<h3>${relativePath}</h3><pre>${this.escapeHTML(content)}</pre>`;
                  this.renderXML(content, xmlOutput, file);
                });
              }
            });
          } catch (error) {
            console.error('Error unzipping PPTX file:', error);
            this.renderXML('<p>Error processing file. Please try again.</p>');
          }
        };

        reader.readAsArrayBuffer(fileInput);
      } else {
        alert('Please upload a valid .pptx file');
      }
    },

    renderXML: function (xmlContent, xmlString, slideFile) {
      const outputElement = document.querySelector('.progress-container');
      outputElement.innerHTML = xmlString;

      // Parse the XML
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlContent, "application/xml");

// Define namespaces
      const drawingMLNS = "http://schemas.openxmlformats.org/drawingml/2006/main";
      const presentationMLNS = "http://schemas.openxmlformats.org/presentationml/2006/main";

// Extract bullets
      const bullets = [];
      const pictures = [];
      const shapes = xmlDoc.getElementsByTagNameNS(presentationMLNS, "sp");

      for (let shape of shapes) {
        const txBody = shape.getElementsByTagNameNS(presentationMLNS, "txBody")[0];
        if (txBody) {
          debugger
          const paragraphs = txBody.getElementsByTagNameNS(drawingMLNS, "p");
          for (let paragraph of paragraphs) {
            debugger
            let bulletText = "";
            const textRuns = paragraph.getElementsByTagNameNS(drawingMLNS, "t");
            for (let textRun of textRuns) {
              bulletText += textRun.textContent;
            }
            if (bulletText.trim()) {
              bullets.push(bulletText.trim());
            }
          }
        }
      }

      const pics = xmlDoc.getElementsByTagNameNS(presentationMLNS, "pic");
      for (let pic of pics) {
        const blip = pic.getElementsByTagNameNS(drawingMLNS, "blip")[0];
        if (blip) {
          const embedId = blip.getAttribute("r:embed");
          pictures.push({ slide: slideFile, embedId });
        }
      }

// Log the bullets
      console.log("Extracted Bullets:", bullets);
    },

    getXPathResult(xpath, contextNode, doc) {
      const nodes = doc.evaluate(
        xpath,
        contextNode || doc,
        (prefix) => {
          if (prefix === 'p') return "http://schemas.openxmlformats.org/presentationml/2006/main";
          if (prefix === 'a') return "http://schemas.openxmlformats.org/drawingml/2006/main";
          return null;
        },
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );

      const results = [];
      for (let i = 0; i < nodes.snapshotLength; i++) {
        results.push(nodes.snapshotItem(i));
      }
      return results;
    },

    escapeHTML: function (unsafe) {
      return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    },
  }, {
    template: 'pptxImport',
  });
});

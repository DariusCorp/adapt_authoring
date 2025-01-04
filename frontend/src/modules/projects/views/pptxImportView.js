define(function (require) {
  var Origin = require('core/origin');
  var OriginView = require('core/views/originView');
  var JSZip = require('jszip');
  var CourseModel = require('core/models/courseModel');
  var Schemas = require('../../scaffold/schemas');
  var ContentObjectModel = require('core/models/contentObjectModel');
  var ArticleModel = require('core/models/articleModel');
  var BlockModel = require('core/models/blockModel');
  var ComponentModel = require('core/models/componentModel');
  var ComponentTypeModel = require('core/models/componentTypeModel');
  var CourseAssetModel = require('core/models/courseAssetModel');
  var EditorCollection = require('../../editor/global/collections/editorCollection');

  return OriginView.extend({
    tagName: 'div',
    className: 'pptxImport',

    preRender: function() {
      Origin.trigger('location:title:update', { title: Origin.l10n.t('app.ppt-import-title') });
      this.listenTo(Origin, {
        'pptxImport:completeImport': this.completeImport
      });
    },

    templateContext: function () {
      return {};
    },

    completeImport: function (sidebarView) {
      sidebarView.updateButton('.framework-import-sidebar-save-button', Origin.l10n.t('app.importing'));

      const input = this.$('input[type="file"].asset-file')[0];
      let fileInput = null;

      if (input && input.files && input.files.length > 0) {
        fileInput = input.files[0];
      }
      if (fileInput && fileInput.name.endsWith('.pptx')) {
        const reader = new FileReader();
        var course = new CourseModel();
        var type = "course";
        var schema = new Schemas(type);
        var options = {model: course};
        const parsedSlides = [];

        reader.onload = async (e) => {
          try {
            const zip = await JSZip.loadAsync(e.target.result);
            let xmlOutput = '';
            let index = 0;

            // Collect promises for all slide processing
            const promises = [];

            zip.forEach((relativePath, file) => {
              if (relativePath.startsWith('ppt/slides/') && relativePath.endsWith('.xml')) {
                const promise = file.async('text').then(async (content) => {
                  xmlOutput += `<h3>${relativePath}</h3><pre>${this.escapeHTML(content)}</pre>`;
                  const result = await this.renderXML(content, xmlOutput, file, zip);
                  parsedSlides.push(result);
                });

                promises.push(promise);
              }
            });

            await Promise.all(promises);

            course.schema = Origin.scaffold.buildSchema(schema, options);
            course.set('title', 'Ppt Import');
            course.set('displayTitle', 'Ppt Import');
            course.save(null, {
              patch: false,
              success: () => this.createNewCourse(course, parsedSlides),
              error: () => console.log("Failed")
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

    createNewCourse(course, parsedSlides) {
      parsedSlides.forEach((value, index) => {
        this.createGenericPage(course, value, index);
      })
    },

    renderXML: async function (xmlContent, xmlString, slideFile, zip) {
      const outputElement = document.querySelector('.progress-container');
      outputElement.innerHTML = xmlString;

      // Parse the XML
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlContent, "application/xml");

      const drawingMLNS = "http://schemas.openxmlformats.org/drawingml/2006/main";
      const presentationMLNS = "http://schemas.openxmlformats.org/presentationml/2006/main";

      let title = '';
      const bullets = [];
      const pictures = [];
      const pictureBlobs = [];
      const shapes = xmlDoc.getElementsByTagNameNS(presentationMLNS, "sp");

      for (let shape of shapes) {
        const nvPr = shape.getElementsByTagNameNS(presentationMLNS, "nvPr")[0];
        const ph = nvPr ? nvPr.getElementsByTagNameNS(presentationMLNS, "ph")[0] : null;
        const isTitle = ph
          && (ph.getAttribute("type") === "title" || ph.getAttribute("type") === "ctrTitle");

        const txBody = shape.getElementsByTagNameNS(presentationMLNS, "txBody")[0];
        if (txBody) {
          const paragraphs = txBody.getElementsByTagNameNS(drawingMLNS, "p");
          for (let paragraph of paragraphs) {
            let textContent = "";
            const textRuns = paragraph.getElementsByTagNameNS(drawingMLNS, "t");
            for (let textRun of textRuns) {
              textContent += textRun.textContent;
            }
            if (textContent.trim()) {
              if (isTitle) {
                title = textContent.trim();
              } else {
                bullets.push(textContent.trim());
              }
            }
          }
        }
      }

      const pics = xmlDoc.getElementsByTagNameNS(presentationMLNS, "pic");
      for (let pic of pics) {
        const blip = pic.getElementsByTagNameNS(drawingMLNS, "blip")[0];
        if (blip) {
          const embedId = blip.getAttribute("r:embed");
          pictures.push({slide: slideFile.name, embedId});
        }
      }

      // Collect promises for all picture processing
      const promises = pictures.map(async (picture) => {
        const pictureRel = picture.slide.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels';
        if (zip.files[pictureRel]) {
          const relContent = await zip.file(pictureRel).async('text');
          const relDoc = new DOMParser().parseFromString(relContent, "application/xml");
          const rel = Array.from(relDoc.getElementsByTagName("Relationship"))
            .find((r) => r.getAttribute("Id") === picture.embedId);

          if (rel) {
            const imageName = this.getLastPart(rel.getAttribute("Target"));
            const mediaPath = `ppt/media/${imageName}`;
            const imageBlob = await zip.file(mediaPath).async('blob');
            pictureBlobs.push(new Blob([imageBlob], {type: 'image/jpeg'}));

            // Download image
            const link = document.createElement('a');
            link.href = URL.createObjectURL(imageBlob);
            link.download = mediaPath.split('/').pop();
            link.click();
          }
        }
      });

      // Wait for all picture processing to complete
      await Promise.all(promises);
      return {title, bullets, pictureBlobs};
    },

    createGenericPage: function (courseModel, slide, index) {
      var contentObjectModel = new ContentObjectModel({
        _type: 'page',
        _courseId: courseModel.get('_id'),
        _parentId: courseModel.get('_id'),
        title: slide.title,
        displayTitle: slide.title
      });
      contentObjectModel.save(null, {
        error: () => window.console.log("Error"),
        success: savedModel => this.createGenericArticle(savedModel, slide, index)
      });
    },

    createGenericArticle: function (pageModel, slide, index) {
      var articleModel = new ArticleModel({
        _courseId: pageModel.get('_courseId'),
        _parentId: pageModel.get('_id'),
        _type: 'article'
      });
      articleModel.save(null, {
        error: () => window.console.log("Error"),
        success: savedModel => {
          slide.bullets.length === 0 && slide.pictureBlobs.length === 0
            ? this.createEmptyBlock(savedModel)
            : this.createComponentsBlocks(savedModel, slide, index)
          Origin.router.navigateTo('editor/' + savedModel.get('_courseId') + '/menu');
        }
      });
    },

    createComponentsBlocks: function (articleModel, slide, index) {
      if (slide.bullets.length > 0) {
        this.createTextBlock(articleModel, slide, index);
      }
      for (let blob of slide.pictureBlobs) {
        this.createImageBlock(articleModel, blob, index);
      }
    },

    createTextBlock: function (articleModel, slide, index) {
      var block = this.createBlock(articleModel);
      block.save(null, {
        error: () => window.console.log("Error"),
        success: savedModel => this.createTextComponent(savedModel, slide.bullets.join('\n'), index)
      })
    },

    createImageBlock: function (articleModel, blob, index) {
      var block = this.createBlock(articleModel);
      block.save(null, {
        error: () => window.console.log("Error"),
        success: savedModel => this.createImageComponent(savedModel, blob, index)
      })
    },

    createEmptyBlock: function (articleModel) {
      var block = this.createBlock(articleModel);
      block.save(null, {
        error: () => window.console.log("Error"),
        success: savedModel => this.createEmptyComponent(savedModel)
      })
    },

    createBlock: function (articleModel) {
      return new BlockModel({
        _courseId: articleModel.get('_courseId'),
        _parentId: articleModel.get('_id'),
        _type: 'block',
        layoutOptions: [
          {type: 'left', name: 'app.layoutleft', pasteZoneRenderOrder: 2},
          {type: 'full', name: 'app.layoutfull', pasteZoneRenderOrder: 1},
          {type: 'right', name: 'app.layoutright', pasteZoneRenderOrder: 3}
        ]
      });
    },

    createEmptyComponent: function (blockModel) {
      let componentTypes = this.getComponentTypes();
      componentTypes.fetch({
        error: () => window.console.log("Error"),
        success: _.bind(function () {
          var componentModel = new ComponentModel({
            _courseId: blockModel.get('_courseId'),
            _parentId: blockModel.get('_id'),
            title: "Capitolul",
            displayTitle: "Capitolul",
            _type: 'component',
            _component: 'blank',
            _componentType: componentTypes.findWhere({component: 'blank'}).attributes._id,
            _layout: 'full'
          });
          componentModel.save(null, {
            error: () => window.console.log("Error"),
            success: function () {
              // Origin.router.navigateTo('editor/' + componentModel.get('_courseId') + '/menu');
            }
          });
        }, this)
      });
    },

    createTextComponent: function (blockModel, text, index) {
      let componentTypes = this.getComponentTypes();
      componentTypes.fetch({
        error: () => window.console.log("Error"),
        success: _.bind(function () {
          var componentModel = new ComponentModel({
            _courseId: blockModel.get('_courseId'),
            _parentId: blockModel.get('_id'),
            title: "Capitolul " + index,
            displayTitle: "Capitolul " + index,
            body: text,
            _type: 'component',
            _component: 'text',
            _componentType: componentTypes.findWhere({component: 'text'}).attributes._id,
            _layout: 'full'
          });
          componentModel.save(null, {
            error: () => window.console.log("Error"),
            success: function () {
              // Origin.router.navigateTo('editor/' + componentModel.get('_courseId') + '/menu');
            }
          });
        }, this)
      });
    },

    createImageComponent: function (blockModel, blob, index) {
      var componentTypes = this.getComponentTypes();
      const formData = new FormData();
      let number = Math.floor(Math.random() * 1000);
      formData.append('file', blob, 'image' + number + '.jpg');
      formData.append('title', 'image' + number + '.jpg');
      formData.append('description', 'asdas');
      formData.append('tags_control', '');
      formData.append('tags', '');

      fetch('/api/asset', {method: 'POST', body: formData})
        .then(response => this.parseJsonResponse(response))
        .then(data => fetch('/api/asset/' + data._id, {method: 'GET'})
          .then(response => this.parseJsonResponse(response))
        )
        .then(data => this.createAndSaveImageComponent(blockModel, componentTypes, index, data))
        .catch(error => console.error('Upload failed:', error));
    },

    getComponentTypes: function () {
      return new EditorCollection(null, {
        model: ComponentTypeModel,
        url: 'api/componenttype',
        _type: 'componentTypes'
      });
    },

    parseJsonResponse(response) {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    },

    createAndSaveImageComponent(blockModel, componentTypes, index, asset) {
      componentTypes.fetch({
        error: () => window.console.log("Error"),
        success: _.bind(function () {
          var componentModel = new ComponentModel({
            _courseId: blockModel.get('_courseId'),
            _parentId: blockModel.get('_id'),
            title: "Capitolul " + index,
            displayTitle: "Capitolul " + index,
            _type: 'component',
            _component: 'graphic',
            _componentType: componentTypes.findWhere({component: 'graphic'}).attributes._id,
            _layout: 'full',
            _onScreen: {
              _isEnabled: false,
              _classes: "",
              _percentInviewVertical: 50
            },
            properties: {
              instruction: "",
              _graphic: {
                alt: "",
                longdescription: "",
                large: "course/assets/" + asset.filename,
                small: "course/assets/" + asset.filename,
                _url: "",
                attribution: "",
                _target: "_blank"
              },
              _isScrollable: false,
              _defaultScrollPercent: 0
            },
            themeSettings: {
              _vanilla: {
                _textAlignment: {
                  _title: "",
                  _body: "",
                  _instruction: ""
                }
              }
            }
          });
          componentModel.save(null, {
            error: () => window.console.log("Error"),
            success: savedModel => this.saveCourseAsset(savedModel, asset)
          });
        }, this)
      });
    },

    saveCourseAsset(component, asset) {
      var courseAssetModel = new CourseAssetModel({
        _assetId: asset._id,
        _contentType: 'component',
        _contentTypeId: component.get('id'),
        _contentTypeParentId: component.attributes._parentId,
        _courseId: component.attributes._courseId,
        _fieldName: asset.filename,
      });
      courseAssetModel.save(null, {
        error: () => window.console.log("Error"),
        success: () => Origin.router.navigateTo('editor/' + courseAssetModel.get('_courseId') + '/menu')
      })
    },

    getLastPart(path) {
      const parts = path.split('/');
      return parts[parts.length - 1];
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

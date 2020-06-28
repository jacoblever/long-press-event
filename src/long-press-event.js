/*!
 * long-press-event - v@version@
 * Pure JavaScript long-press-event
 * https://github.com/john-doherty/long-press-event
 * @author John Doherty <www.johndoherty.info>
 * @license MIT
 */
(function (window, document) {

    'use strict';

    // local timer object based on rAF
    var timer = null;

    // check if we're using a touch screen
    var isTouch = (('ontouchstart' in window) || (navigator.MaxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0));

    // switch to touch events if using a touch screen
    var mouseDown = isTouch ? 'touchstart' : 'mousedown';
    var mouseUp = isTouch ? 'touchend' : 'mouseup';
    var mouseMove = isTouch ? 'touchmove' : 'mousemove';

    // track number of pixels the mouse moves during long press
    var startX = 0; // mouse x position when timer started
    var startY = 0; // mouse y position when timer started
    var maxDiffX = 10; // max number of X pixels the mouse can move during long press before it is canceled
    var maxDiffY = 10; // max number of Y pixels the mouse can move during long press before it is canceled

    // default delay to wait before triggering the long press event (ms)
    var defaultDelay = '1500';

    // custom attribute used to override the default delay
    var customDelayAttribute = 'data-long-press-delay';

    // patch CustomEvent to allow constructor creation (IE/Chrome)
    if (typeof window.CustomEvent !== 'function') {

        window.CustomEvent = function(event, params) {

            params = params || { bubbles: false, cancelable: false, detail: undefined };

            var evt = document.createEvent('CustomEvent');
            evt.initCustomEvent(event, params.bubbles, params.cancelable, params.detail);
            return evt;
        };

        window.CustomEvent.prototype = window.Event.prototype;
    }

    // requestAnimationFrame() shim by Paul Irish
    window.requestAnimFrame = (function() {
        return window.requestAnimationFrame ||
            window.webkitRequestAnimationFrame ||
            window.mozRequestAnimationFrame ||
            window.oRequestAnimationFrame ||
            window.msRequestAnimationFrame || function(callback) {
                window.setTimeout(callback, 1000 / 60);
            };
    })();

    /**
     * Behaves the same as setTimeout except uses requestAnimationFrame() where possible for better performance
     * @param {function} fn The callback function
     * @param {int} delay The delay in milliseconds
     * @returns {object} handle to the timeout object
     */
    function requestTimeout(fn, delay) {

        if (!window.requestAnimationFrame && !window.webkitRequestAnimationFrame &&
            !(window.mozRequestAnimationFrame && window.mozCancelRequestAnimationFrame) && // Firefox 5 ships without cancel support
            !window.oRequestAnimationFrame && !window.msRequestAnimationFrame) return window.setTimeout(fn, delay);

        var start = new Date().getTime();
        var handle = {};

        var loop = function() {
            var current = new Date().getTime();
            var delta = current - start;

            if (delta >= delay) {
                fn.call();
            }
            else {
                handle.value = requestAnimFrame(loop);
            }
        };

        handle.value = requestAnimFrame(loop);

        return handle;
    }

    /**
     * Behaves the same as clearTimeout except uses cancelRequestAnimationFrame() where possible for better performance
     * @param {object} handle The callback function
     * @returns {void}
     */
    function clearRequestTimeout(handle) {
        if (handle) {
            window.cancelAnimationFrame ? window.cancelAnimationFrame(handle.value) :
            window.webkitCancelAnimationFrame ? window.webkitCancelAnimationFrame(handle.value) :
            window.webkitCancelRequestAnimationFrame ? window.webkitCancelRequestAnimationFrame(handle.value) : /* Support for legacy API */
            window.mozCancelRequestAnimationFrame ? window.mozCancelRequestAnimationFrame(handle.value) :
            window.oCancelRequestAnimationFrame	? window.oCancelRequestAnimationFrame(handle.value) :
            window.msCancelRequestAnimationFrame ? window.msCancelRequestAnimationFrame(handle.value) :
            clearTimeout(handle);
        }
    }

    /**
     * Fires the 'long-press' event on element
     * @param {MouseEvent|TouchEvent} originalEvent The original event being fired
     * @returns {void}
     */
    function fireLongPressEvent(originalEvent) {

        clearLongPressTimer();

        var clientX = getClientX(originalEvent),
            clientY = getClientY(originalEvent);

        // fire the long-press event
        var suppressClickEvent = this.dispatchEvent(new CustomEvent('long-press', { bubbles: true, cancelable: true, detail: { clientX: clientX, clientY: clientY } }));

        if (suppressClickEvent) {

            // temporarily intercept and clear the next click
            document.addEventListener(mouseUp, function clearMouseUp(e) {
                document.removeEventListener(mouseUp, clearMouseUp, true);
                cancelEvent(e);
            }, true);
        }
    }

    /**
     * method responsible for starting the long press timer
     * @param {event} e - event object
     * @returns {void}
     */
    function startLongPressTimer(e) {

        clearLongPressTimer(e);

        var el = e.target;

        var attribute = el.getAttribute(customDelayAttribute);
        if(!attribute) {
            var closestLongPressElement = el.closest('[' + customDelayAttribute + ']');
            if(closestLongPressElement) {
                attribute = closestLongPressElement.getAttribute(customDelayAttribute);
            }
        }
        
        // get delay from html attribute if it exists, otherwise use the default
        var longPressDelayInMs = parseInt(attribute || defaultDelay, 10);

        // start the timer
        timer = requestTimeout(fireLongPressEvent.bind(el, e), longPressDelayInMs);
    }

    /**
     * Gets the X location of the touch or mouse event
     * @param {event} e - event object
     * @returns {number}
     */
    function getClientX(event) {
        return isTouch ? event.touches[0].pageX : event.clientX;
    }

    /**
     * Gets the Y location of the touch or mouse event
     * @param {event} e - event object
     * @returns {number}
     */
    function getClientY(event) {
        return isTouch ? event.touches[0].pageY : event.clientY;
    }

    /**
     * method responsible for clearing a pending long press timer
     * @param {event} e - event object
     * @returns {void}
     */
    function clearLongPressTimer(e) {
        clearRequestTimeout(timer);
        timer = null;
    }

    /**
    * Cancels the current event
    * @param {object} e - browser event object
    * @returns {void}
    */
    function cancelEvent(e) {
        e.stopImmediatePropagation();
        e.preventDefault();
        e.stopPropagation();
    }

    /**
     * Starts the timer on mouse down and logs current position
     * @param {object} e - browser event object
     * @returns {void}
     */
    function mouseDownHandler(e) {
        startX = getClientX(e);
        startY = getClientY(e);
        startLongPressTimer(e);
    }

    /**
     * If the mouse moves n pixels during long-press, cancel the timer
     * @param {object} e - browser event object
     * @returns {void}
     */
    function mouseMoveHandler(e) {

        // calculate total number of pixels the pointer has moved
        var diffX = Math.abs(startX - getClientX(e));
        var diffY = Math.abs(startY - getClientY(e));

        // if pointer has moved more than allowed, cancel the long-press timer and therefore the event
        if (diffX >= maxDiffX || diffY >= maxDiffY) {
            clearLongPressTimer(e);
        }
    }

    // hook events that clear a pending long press event
    document.addEventListener(mouseUp, clearLongPressTimer, true);
    document.addEventListener(mouseMove, mouseMoveHandler, true);
    document.addEventListener('wheel', clearLongPressTimer, true);
    document.addEventListener('scroll', clearLongPressTimer, true);

    // hook events that can trigger a long press event
    document.addEventListener(mouseDown, mouseDownHandler, true); // <- start

}(window, document));
